// ebirds.qc — "Bandada de pájaros": a flock of white birds that drifts around
// the sky like the swarm pilot, but PACIFIC and NON-SOLID. Pure decoration:
// no target, no pursuit, no shooting, no damage, the heli flies through it.
//
// Reuses the boid helpers from eswarm.qc (swarm_cohesion / swarm_alignment /
// swarm_separation / swarm_environment) — they only look at neighbours of the
// SAME classname, so a flock of "birds" boids only with other birds, never
// with swarm pilots. The sprite (progs/birds.spr, built by
// modeditor/scripts/gen-birds-spr.js) animates its wing-flap frames.

float BIRDS_MAX_SPEED = 200;   // birds drift slower than the war drones (320)
float BIRDS_MIN_SPEED = 90;    // and can dawdle (drones never go below 220)
float BIRDS_NFRAMES   = 6;     // frames in birds.spr (frame1..6)
// Wing-flap speed: frames advance with `time`. At 8 flaps/sec the 4-frame
// cycle reads as a brisk wing-beat. A per-entity phase (self.cnt) desyncs
// flocks so they don't all flap in lockstep.
float BIRDS_FLAP_HZ   = 8;

// Altitude band: birds stay between the water and the clouds. Water surface
// is WATER_Z = -8; the editor parks clouds at CLOUD_LAYER_Z = 1740. Keep a
// margin so they never skim the sea or punch into the cloud layer.
float BIRDS_MIN_Z     = 160;   // ~168u above the water surface
float BIRDS_MAX_Z     = 1600;  // safely below the cloud layer (1740)
// Birds prefer to travel HORIZONTALLY: their vertical velocity is damped each
// tick so they glide rather than porpoise up and down while flocking.
float BIRDS_Z_DAMP    = 0.6;   // fraction of vertical velocity kept per tick

// Movement think — the swarm boid loop with pursuit/targeting stripped out.
// cohesion + alignment + separation keep the flock together; environment
// keeps it off the ground/ceiling/walls; a little jitter keeps it lively.
void() birds_fly =
{
	local vector newvel;
	local vector cohesion;
	local vector alignment;
	local vector separation;
	local vector environment;
	local float spd;

	cohesion    = swarm_cohesion();
	alignment   = swarm_alignment();
	separation  = swarm_separation();
	environment = swarm_environment();

	newvel = self.velocity;
	newvel = (newvel + (cohesion * 0.04));
	newvel = (newvel + (alignment * 0.5));
	newvel = (newvel + (separation * 0.35));
	newvel = (newvel + environment);

	// Gentle wander jitter — mostly horizontal (tiny on Z so they don't bob).
	newvel_x = (newvel_x + ((random() - 0.5) * 8));
	newvel_y = (newvel_y + ((random() - 0.5) * 8));
	newvel_z = (newvel_z + ((random() - 0.5) * 2));

	// Prefer horizontal travel: damp the vertical component so the flock
	// glides level instead of climbing/diving while it flocks.
	newvel_z = (newvel_z * BIRDS_Z_DAMP);

	// Altitude band: steer back inside [BIRDS_MIN_Z, BIRDS_MAX_Z]. Below the
	// floor push up, above the ceiling push down — a soft nudge on Z velocity.
	if ((self.origin_z < BIRDS_MIN_Z))
	{
		newvel_z = (newvel_z + ((BIRDS_MIN_Z - self.origin_z) * 0.5));
		if (newvel_z > 120) newvel_z = 120;
	}
	if ((self.origin_z > BIRDS_MAX_Z))
	{
		newvel_z = (newvel_z - ((self.origin_z - BIRDS_MAX_Z) * 0.5));
		if (newvel_z < -120) newvel_z = -120;
	}

	spd = vlen(newvel);
	if ((spd > BIRDS_MAX_SPEED))
		newvel = (normalize(newvel) * BIRDS_MAX_SPEED);
	if (((spd > 0) && (spd < BIRDS_MIN_SPEED)))
		newvel = (normalize(newvel) * BIRDS_MIN_SPEED);
	if ((spd == 0))
	{
		makevectors(self.angles);
		newvel = (v_forward * BIRDS_MIN_SPEED);
	}

	self.velocity = ((self.velocity * 0.5) + (newvel * 0.5));
	self.speed = vlen(self.velocity);

	// Hard clamp the origin to the band as a backstop, in case a fast dive
	// overshoots the soft steering between ticks.
	if ((self.origin_z < BIRDS_MIN_Z))
	{
		setorigin(self, self.origin - [0, 0, self.origin_z - BIRDS_MIN_Z]);
		if (self.velocity_z < 0) self.velocity_z = 0;
	}
	if ((self.origin_z > BIRDS_MAX_Z))
	{
		setorigin(self, self.origin - [0, 0, self.origin_z - BIRDS_MAX_Z]);
		if (self.velocity_z > 0) self.velocity_z = 0;
	}

	if ((self.flags & FL_ONGROUND))
	{
		self.flags = (self.flags - FL_ONGROUND);
		self.groundentity = world;
	}

	// Wing-flap animation, derived from time + this flock's phase (self.cnt)
	// so the think cadence (0.1s) doesn't gate the flap and flocks desync.
	self.frame = floor((time + self.cnt) * BIRDS_FLAP_HZ);
	self.frame = self.frame - floor(self.frame / BIRDS_NFRAMES) * BIRDS_NFRAMES;

	self.think = birds_fly;
	self.nextthink = (time + 0.1);
};

void() birds_start =
{
	makevectors(self.angles);
	self.velocity = (v_forward * BIRDS_MIN_SPEED);
	self.think = birds_fly;
	self.nextthink = ((time + 0.1) + (random() * 0.4));
};

// monster_birds_flock — placed by the editor ("birds"). Despite the
// monster_ prefix (so the editor groups it with the aerial entities and the
// enemy-slot machinery accepts it), it is harmless: non-solid, no damage,
// no AI hostility. A single think (birds_fly) both moves the flock and
// advances the wing-flap frame.
void() monster_birds_flock =
{
	precache_model("progs/birds.spr");
	self.solid = SOLID_NOT;            // pacific: the heli flies through it
	self.movetype = MOVETYPE_FLY;
	setmodel(self, "progs/birds.spr");
	setsize(self, '-8 -8 -8', '8 8 8');
	self.classname = "monster_birds_flock";
	// No takedamage, no touch, no th_die — birds can't be hurt or hit.
	self.cnt = random();               // per-flock flap phase (desync)
	self.frame = floor(random() * BIRDS_NFRAMES);

	self.think = birds_start;
	self.nextthink = ((time + 0.1) + (random() * 0.2));
};
