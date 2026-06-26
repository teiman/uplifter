// objectives.qc — Objective rotation, civilians and ship deposit.
//
// Game state machine:
//   - At map start (objectives_init), enumerate all info_pickup entities.
//     Pick one at random and call it "active". Mark the rest dormant.
//   - When the heli lands inside the active info_pickup's radius, the
//     pickup spawns civilian NPCs that walk toward the heli. On contact
//     each civilian increments self.pax and removes itself.
//   - When pax >= PICKUP_CAPACITY, the active pickup is "done"; spawning
//     stops. The player flies to info_ship and lands. info_ship's touch
//     handler reads pax, awards credits, resets stars, picks the next
//     active pickup at random.
//
// We deliberately keep one objective active at a time (per gameplay.md
// "El sistema activa 1 objetivo a la vez"). The "next" pickup is chosen
// uniformly from the remaining ones; the previous active can be re-picked
// later (no exclusion across cycles for now).

float PICKUP_CAPACITY        = 8;
float PICKUP_ACTIVE_RADIUS   = 192;   // landing within this distance counts
float PICKUP_SPAWN_RADIUS    = 96;    // civilians wait scattered within this ring
float SHIP_ACTIVE_RADIUS     = 256;
float SHIP_DEPOSIT_CREDITS   = 250;   // credits per delivered passenger
float CIV_WALK_SPEED         = 120;   // units/s
float CIV_BOARD_DIST         = 96;    // generous board radius (heli is 32u wide)
float CIV_BOARD_VERT         = 48;    // max heli-vs-civilian height gap to board
                                      // (so a hovering heli can't be boarded)
float CIV_THINK_INTERVAL     = 0.1;   // 10 Hz so velocity/yaw stay responsive

// Civilians now PRE-SPAWN at the active pickup and wait there. They jump in
// place when the heli flies near, and run to it once it lands.
float CIV_WAITING_MAX        = 8;     // max civilians waiting at once (= heli cap)
float CIV_JUMP_RADIUS        = 600;   // heli within this (flying) → civilians jump
float CIV_JUMP_VZ            = 130;   // upward velocity of an excited little hop
float CIV_JUMP_INTERVAL      = 0.7;   // seconds between hops while excited
float CIV_IDLE_HOP_MIN       = 4;     // ambient idle hop: random 4..8s,
float CIV_IDLE_HOP_MAX       = 8;     // even with no heli near
float CIV_STAND_FRAME        = 17;    // player.mdl idle/stand frame
float CIV_SPAWN_STAGGER      = 0.25;  // seconds between pre-spawned civilians
float PICKUP_HANDOFF_QUIET   = 2.0;   // seconds the new pickup's smoke is hushed

// Civilian behaviour state.
float CIV_WAIT = 0;   // standing at the pickup, idle
float CIV_JUMP = 1;   // hopping in place (heli flying near)
float CIV_RUN  = 2;   // running toward a landed heli to board
float CIV_DELIVER = 3; // disembarked pax running from the heli to the ship

// --- Disembark (delivery) feel ---------------------------------------------
// Unloading at the ship is no longer instant: each passenger drops out of the
// heli one at a time (a little sound), runs to the nearest info_ship, and
// SOME stop briefly to wave before carrying on. Reaching the ship credits
// that single passenger and advances the day quota by 1.
float DPAX_DROP_INTERVAL  = 0.45;  // seconds between each pax dropping out
float DPAX_RUN_SPEED      = 70;    // units/s — a calm walk to the goal (not a sprint)
float DPAX_ARRIVE_DIST    = 64;    // within this of the ship → delivered
float DPAX_WAVE_FRACTION   = 0.30; // fraction of pax that will wave ONCE (the rest never)
float DPAX_WAVE_TIME       = 1.2;  // seconds spent waving
float DPAX_LIFETIME        = 18;   // hard despawn (anti-stuck); pure cosmetic

// World-text labels (progs/worldtext.spr frames — see gen-text-spr.js).
float WT_EXTRACTION = 0;
float WT_PICKUP     = 1;
float WT_RETURN     = 2;
float WORLDTEXT_Z   = 220;   // how high the label floats above the marker

// Per-player passenger count → declared in defs.qc (so day.qc can read it).
// On the player: next time we may drop ONE passenger out at the ship during a
// staggered unload (so they disembark one-by-one, not all at once).
.float dpax_next_drop;
// On the info_pickup entity: next time it spawns a marker puff.
.float next_puff;
// On info_pickup / info_ship: the floating worldtext label it currently owns
// (world if none). WorldText_Set creates/moves/clears it.
.entity textmark;
// Marker on info_pickup: which player it's actively spawning for.
.entity active_player;
// On a civilian: behaviour state (CIV_WAIT/JUMP/RUN), next excited-hop time
// (when the heli is near) and next ambient idle-hop time (random, always).
.float civ_state;
.float civ_next_hop;
.float civ_next_idle_hop;
// On a civilian: the info_pickup it belongs to (so the pickup can track how
// many are still waiting and top them back up as they board).
.entity civ_pickup;
// On a disembarking passenger (CIV_DELIVER): the ship it's running toward and,
// if it stopped to wave, the time until it resumes running.
.entity dpax_ship;
.float dpax_wave_until;
// On the info_pickup: how many civilians it has currently waiting/alive.
.float civ_alive;
// On the info_pickup: next time it may spawn a waiting civilian (staggered
// one-per-tick so they don't overlap each other's bbox on spawn).
.float next_civilian;
// On the info_pickup: while > time, the smoke beacon is temporarily
// suppressed (right after waking this pickup via a handoff — a moment of
// "this is the new spot" feedback).
.float puff_suppress_until;
// On the info_pickup: how many civilians it has SHOWN since it became active
// (capped at CIV_WAITING_MAX). When it has shown its cap and none remain
// waiting but the day still needs more, we wake a different pickup.
.float civ_shown;
// On the info_pickup: set once we've told the player to return to the ship
// (no civilians left to pick up this day) so we don't nag every frame.
.float civ_sent_home;
// On the info_representative: the animated flag entity spawned next to it on
// day 5 so it can be cleaned up when the rep is picked up.
.entity rep_flag;
// On the player: 1 while carrying the day-5 representative. Declared up here
// (not at info_carrier) so Mission_SetLine, defined earlier, can read it.
.float has_rep;

// Globals (entity-attached on `world`).
entity g_objective_active;
entity g_ship;

// Forward decls de los constructores de monstruos que usa slot_spawn_enemy.
// Sus definiciones reales están en aag.qc / sam.qc / rad.qc, que se
// compilan después de objectives.qc en progs.src.
void() monster_aag;
void() monster_sam;
void() monster_rad;
// Forward decl: pressure-helo flight spawner (defined in hedrone.qc, later).
void(entity pk) spawn_pressure_flight;

// Forward decl: defined below; pickup_think calls it to hand off to a fresh
// objective when its present batch is rescued but the day's quota remains.
void() rotate_objective;
// Forward decl: sets the persistent bottom mission line (defined below).
void() Mission_SetLine;
// Forward decl: one-shot "return to ship" announcement (defined below).
void() Objective_AnnounceReturn;
// Forward decl: muestra/oculta el sprite "prohibido" sobre un barco/hospital.
void(entity ship, float show) Ship_ShowNoEntry;

// ---------------------------------------------------------------------
// Floating world-text labels
// ---------------------------------------------------------------------
//
// Keep ONE worldtext billboard floating above a marker (a pickup or the
// ship), showing word `code` (WT_*). Call every tick with the word you want
// shown, or code < 0 to clear it. The label entity is remembered on
// owner.textmark so we can move/reuse/remove it without spawning churn.
//
//   owner : the info_pickup / info_ship that owns the label.
//   code  : WT_PICKUP / WT_EXTRACTION / WT_RETURN, or -1 to hide.
void(entity owner, float code) WorldText_Set =
{
	local entity m;

	if (code < 0)
	{
		// Hide: remove the label if we have one.
		if (owner.textmark != world)
		{
			remove(owner.textmark);
			owner.textmark = world;
		}
		return;
	}

	m = owner.textmark;
	if (m == world)
	{
		m = spawn();
		m.classname = "worldtext_dyn";
		m.movetype = MOVETYPE_NONE;
		m.solid = SOLID_NOT;
		setmodel(m, "progs/worldtext.spr");
		owner.textmark = m;
	}
	// Float it above the marker and set the word.
	setorigin(m, owner.origin + [0, 0, WORLDTEXT_Z]);
	m.frame = code;
};

float PICKUP_PUFF_INTERVAL = 0.1;     // seconds between marker puffs
float PICKUP_PUFF_FRAME_DT = 0.6;     // seconds per anim frame (puffs live longer)
float PICKUP_PUFF_RISE_VZ  = 30;      // upward velocity — 50% slower rise
float PICKUP_PUFF_RADIUS   = 24;      // tighter cluster than before
float PICKUP_PUFF_Z_RANGE  = 256;     // spawn height variance above marker

// ---------------------------------------------------------------------
// Pickup marker puffs
// ---------------------------------------------------------------------
//
// While an info_pickup is the active objective we spit out smoke puffs
// above it on a timer so the player can see where to go. Same sprite set
// as helo dust (`smoke[1-5].spr`), but animated slower and rising — visual
// language closer to a beacon than to downwash dust.

void() pickup_puff_advance =
{
	self.frame = (self.frame + 1);
	if ((self.frame >= 23))
	{
		remove(self);
		return;
	}
	// Slow horizontal drift damp; vertical keeps lifting.
	self.velocity_x = (self.velocity_x * 0.94);
	self.velocity_y = (self.velocity_y * 0.94);
	self.think = pickup_puff_advance;
	self.nextthink = (time + PICKUP_PUFF_FRAME_DT);
};

void(vector where) pickup_spawn_puff =
{
	local entity e;
	local float pick;

	e = spawn();
	pick = floor(random() * 5);
	if ((pick < 1))
	{
		setmodel(e, "progs/puff_g.spr");
	}
	else if ((pick < 2))
	{
		setmodel(e, "progs/puff_g2.spr");
	}
	else if ((pick < 3))
	{
		setmodel(e, "progs/puff_g3.spr");
	}
	else if ((pick < 4))
	{
		setmodel(e, "progs/puff_g4.spr");
	}
	else
	{
		setmodel(e, "progs/puff_g5.spr");
	}
	setorigin(e, where);
	e.movetype = MOVETYPE_NOCLIP;
	e.solid = SOLID_NOT;
	e.classname = "pickup_puff";
	// Start mid-animation at a random frame so the column looks chaotic
	// rather than synchronised. Bias toward the early frames so most
	// puffs still have life left.
	e.frame = floor(random() * 14);
	e.velocity_x = ((random() - 0.5) * 20);
	e.velocity_y = ((random() - 0.5) * 20);
	e.velocity_z = PICKUP_PUFF_RISE_VZ;
	e.think = pickup_puff_advance;
	e.nextthink = (time + PICKUP_PUFF_FRAME_DT);
};

// ---------------------------------------------------------------------
// Civilian NPC
// ---------------------------------------------------------------------

void() civilian_think;

// When a civilian leaves play (boards, dies, or its pickup goes away) keep
// the owning pickup's live-count straight so it can top the group back up.
void() civilian_release =
{
	if ((self.civ_pickup != world) && (self.civ_pickup.civ_alive > 0))
	{
		self.civ_pickup.civ_alive = (self.civ_pickup.civ_alive - 1);
	}
};

void() civilian_die =
{
	// A civilian killed before pickup leaves the field but was NEVER
	// delivered, so it must be REPLACED or the deliver-quota could never be
	// met. Two counters must be rolled back so the owning pickup re-spawns
	// one in its place:
	//   - g_wave_spawned (global, via Day_OnCivilianLost) → want > 0 again.
	//   - civ_shown (this pickup's "how many I've put out") → otherwise the
	//     pickup thinks it already showed its CIV_WAITING_MAX cap and refuses
	//     to top up, which DEADLOCKS the day if you kill everyone here.
	if ((self.civ_pickup != world) && (self.civ_pickup.civ_shown > 0))
	{
		self.civ_pickup.civ_shown = (self.civ_pickup.civ_shown - 1);
	}
	civilian_release();
	Day_OnCivilianLost();
	remove(self);
};

// Find the nearest player-piloted heli (returns world if none).
entity() civ_find_heli =
{
	local entity client;
	local entity heli;
	local entity best;
	local float bestd;
	local float d;

	best = world;
	bestd = 0;
	client = find(world, classname, "player");
	while (client != world)
	{
		heli = client.enemy;
		if ((heli != world) && (heli.owner == client) && (heli.health >= 1))
		{
			d = vlen((heli.origin - self.origin));
			if ((best == world) || (d < bestd))
			{
				best = heli;
				bestd = d;
			}
		}
		client = find(client, classname, "player");
	}
	return (best);
};

// Per-tick civilian behaviour. State machine:
//   RUN  — a player heli is landed within the pickup radius: run to it and
//          board on contact.
//   JUMP — a heli is flying within CIV_JUMP_RADIUS: hop in place to wave it
//          down (a real little physics hop + jump frame).
//   WAIT — otherwise: stand idle at the pickup.
void() civilian_think =
{
	local vector dir;
	local float dist;
	local float yaw;
	local entity heli;
	local entity pk;

	self.think = civilian_think;
	self.nextthink = (time + CIV_THINK_INTERVAL);

	// If our pickup is gone or no longer the active objective, disband. It was
	// never delivered, so allow a replacement (Day_OnCivilianLost) and keep
	// g_wave_left balanced.
	pk = self.civ_pickup;
	if ((pk == world) || (pk != g_objective_active))
	{
		civilian_release();
		Day_OnCivilianLost();
		remove(self);
		return;
	}

	heli = civ_find_heli();
	if (heli == world)
	{
		self.civ_state = CIV_WAIT;
		self.frame = CIV_STAND_FRAME;
		return;
	}

	dist = vlen((heli.origin - self.origin));

	// RUN: only when the heli is actually SET DOWN at this pickup — landed
	// (touched the helipad) AND resting near ground level, not just hovering
	// low. Run to it and board only on real ground contact.
	if (heli.landed && (vlen((heli.origin - pk.origin)) <= PICKUP_ACTIVE_RADIUS))
	{
		self.civ_state = CIV_RUN;
		dir = (heli.origin - self.origin);
		dir_z = 0;

		// Board only when close horizontally AND at a similar height (the
		// heli is on the ground, the civilian walked up to it). A heli
		// hovering well above the civilian can't be boarded.
		if ((vlen(dir) <= CIV_BOARD_DIST) && (fabs(heli.origin_z - self.origin_z) <= CIV_BOARD_VERT))
		{
			if ((heli.owner.pax < PICKUP_CAPACITY))
			{
				heli.owner.pax = (heli.owner.pax + 1);
				sound(heli, CHAN_ITEM, "items/r_item1.wav", 1, ATTN_NORM);
				// Rescuing a civilian raises notoriety: +1 star per pickup.
				// Stars_Add works on `self`, so swap to the player briefly.
				local entity osv;
				osv = self;
				self = heli.owner;
				Stars_Add(1);
				self = osv;
			}
			civilian_release();          // leaves the field (NOT delivered yet)
			Day_OnCivilianPickedUp();    // delivery is what counts; see ship_check
			remove(self);
			return;
		}

		yaw = vectoyaw(dir);
		self.angles_y = yaw;
		self.ideal_yaw = yaw;
		walkmove(yaw, (CIV_WALK_SPEED * CIV_THINK_INTERVAL));
		self.walkframe = (self.walkframe + 1);
		if ((self.walkframe > 6)) { self.walkframe = 0; }
		self.frame = self.walkframe;   // run cycle (frames 0..6)
		return;
	}

	// JUMP: heli flying near → hop in place to flag it down.
	if (dist <= CIV_JUMP_RADIUS)
	{
		self.civ_state = CIV_JUMP;
		// Face the heli while waving.
		dir = (heli.origin - self.origin);
		dir_z = 0;
		self.angles_y = vectoyaw(dir);
		// Real little hop when grounded, on a gentle cadence. player.mdl has
		// no dedicated jump frame (41-49 are the axe-death anim), so the hop
		// is sold by the physical vertical motion; keep an upright stand pose.
		if ((self.flags & FL_ONGROUND) && (time >= self.civ_next_hop))
		{
			self.velocity_z = CIV_JUMP_VZ;
			self.flags = (self.flags - (self.flags & FL_ONGROUND));
			self.civ_next_hop = (time + CIV_JUMP_INTERVAL);
		}
		self.frame = CIV_STAND_FRAME;   // upright; the hop is the vertical motion
		return;
	}

	// WAIT: idle at the pickup. Even with no heli near, give an ambient
	// little hop every CIV_IDLE_HOP_MIN..MAX seconds so the group looks alive
	// (a random 4..8s cadence per civilian).
	self.civ_state = CIV_WAIT;
	self.frame = CIV_STAND_FRAME;
	if ((self.flags & FL_ONGROUND) && (time >= self.civ_next_idle_hop))
	{
		self.velocity_z = CIV_JUMP_VZ;
		self.flags = (self.flags - (self.flags & FL_ONGROUND));
		self.civ_next_idle_hop = (time + CIV_IDLE_HOP_MIN + random() * (CIV_IDLE_HOP_MAX - CIV_IDLE_HOP_MIN));
	}
};

// Spawn one civilian WAITING at `org` (a spot at the pickup). `org.z` is a
// hint height; `pk` is the owning info_pickup. The civilian stands idle
// until a heli comes near.
//
// Grounding: the pickup (pk) has already snapped to the real ground in
// info_pickup, so pk.origin_z IS the ground level. We trace straight down at
// the civilian's XY (starting above the pickup's ground) to follow uneven
// terrain, and put the civilian's feet there; if the trace misses (the ring
// spot hangs over a ledge/water) we fall back to the pickup's ground Z. This
// guarantees they rest on the ground — a floating civilian can't walk to the
// heli, and droptofloor() is unreliable (256u reach, fails inside solid).
void(vector org, entity pk) spawn_civilian =
{
	local entity c;
	local vector top;
	local vector bottom;
	local float floorz;

	c = spawn();
	c.classname = "civilian";
	c.solid = SOLID_SLIDEBOX;
	c.movetype = MOVETYPE_STEP;
	setmodel(c, "progs/player.mdl");
	setsize(c, '-12 -12 -24', '12 12 24');
	Day_OnCivilianSpawned();

	top = org;       top_z    = (pk.origin_z + 64);
	bottom = org;    bottom_z = (pk.origin_z - 512);
	traceline(top, bottom, TRUE, c);
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		floorz = trace_endpos_z;
	}
	else
	{
		floorz = pk.origin_z;   // fallback: pickup's own (settled) ground Z
	}
	// Put the origin AT ground level. player.mdl is drawn with its feet ~at
	// the origin (the bbox extends 24u below for collision, but the visible
	// feet sit at the origin), so origin = floorz lands the feet on the deck.
	// The old `floorz + 25` left them hovering 25u up — same bug we fixed for
	// the disembarking pax at the ship (confirmed there: origin == ground Z).
	org_z = floorz;
	setorigin(c, org);

	c.flags = (c.flags | FL_MONSTER | FL_ONGROUND);
	c.groundentity = trace_ent;

	// Faction: civilians are on the PLAYER's team so the aim reticle shows
	// them GREEN (friendly), not red. The reticle (place_targetbox in
	// airmisc.qc) compares the target's .ts to the player's .ts: same side →
	// green (frame 3), otherwise red (frame 1). In single-player the player's
	// ts is T1 (see client.qc), so put civilians on T1 too. (.team kept in
	// sync so setup_teament-style code agrees.)
	c.team = 1;
	c.ts = T1;

	c.health = 25;
	c.takedamage = DAMAGE_AIM;
	c.th_die = civilian_die;
	c.civ_pickup = pk;
	c.civ_state = CIV_WAIT;
	c.frame = CIV_STAND_FRAME;
	c.civ_next_hop = (time + random() * CIV_JUMP_INTERVAL);  // desync hops
	// Stagger the first ambient idle hop across the full 0..MAX window so the
	// group doesn't all hop in sync on spawn.
	c.civ_next_idle_hop = (time + random() * CIV_IDLE_HOP_MAX);
	c.think = civilian_think;
	c.nextthink = (time + 0.1 + random() * 0.1);

	pk.civ_alive = (pk.civ_alive + 1);
};

// ---------------------------------------------------------------------
// info_pickup
// ---------------------------------------------------------------------

// Per-tick logic on the pickup: emit marker puffs while we're the active
// objective, and spawn civilians when a player lands within range.
void() pickup_think =
{
	local vector spawnpos;
	local vector puffpos;
	local float ang;
	local float rad;
	local float want;

	self.nextthink = (time + 0.1);
	self.think = pickup_think;

	if ((self != g_objective_active))
	{
		// Not the active objective → no label here (clear a stale one).
		WorldText_Set(self, -1);
		return;
	}

	// Floating "PICKUP" label while this active pickup still has survivors to
	// grab (waiting now, or yet to be created this day); hide it once it's
	// empty (the player should head to the ship instead — handled there).
	if ((self.civ_alive > 0) || (g_wave_spawned < g_wave_quota))
	{
		WorldText_Set(self, WT_PICKUP);
	}
	else
	{
		WorldText_Set(self, -1);
	}

	// Marker puffs: smoke beacon over the pickup. Spawns at random heights
	// so the column looks volumetric instead of a single rising rope.
	// Temporarily suppressed right after a fresh-objective handoff.
	if ((time >= self.next_puff) && (time >= self.puff_suppress_until))
	{
		self.next_puff = (time + PICKUP_PUFF_INTERVAL);
		ang = (random() * 360);
		rad = (random() * PICKUP_PUFF_RADIUS);
		makevectors(ang * '0 1 0');
		puffpos = self.origin + (v_forward * rad);
		puffpos_z = self.origin_z + 16 + (random() * PICKUP_PUFF_Z_RANGE);
		pickup_spawn_puff(puffpos);
	}

	// The day's goal: DELIVER g_wave_quota civilians to the ship. Once enough
	// have been created to cover the quota (and the rest are in transit), no
	// pickup needs to spawn more. We create civilians until g_wave_spawned
	// reaches the quota (deaths un-count via Day_OnCivilianLost so we top up).
	if ((g_wave_spawned >= g_wave_quota))
	{
		// All the day's civilians exist (waiting, aboard, or delivered) — this
		// pickup has nothing left to spawn.
		want = 0;
	}
	else
	{
		want = (g_wave_quota - g_wave_spawned);
	}

	// Keep up to CIV_WAITING_MAX waiting at THIS pickup, never more than the
	// day still needs to create. self.civ_shown caps how many one pickup
	// shows so big quotas spread across several pickups.
	if ((self.civ_alive < CIV_WAITING_MAX)
		&& (self.civ_shown < CIV_WAITING_MAX)
		&& (want > 0)
		&& (time >= self.next_civilian))
	{
		self.next_civilian = (time + CIV_SPAWN_STAGGER);
		ang = (random() * 360);
		rad = (PICKUP_SPAWN_RADIUS * (0.4 + random() * 0.6));
		makevectors(ang * '0 1 0');
		spawnpos = self.origin + (v_forward * rad);
		spawnpos_z = self.origin_z + 8;
		spawn_civilian(spawnpos, self);
		self.civ_shown = (self.civ_shown + 1);
	}

	// When this pickup has no one left waiting AND can't spawn more here
	// (shown its cap, or all the day's civilians already exist), decide what
	// the player should do next:
	//   (A) the day still has civilians to CREATE elsewhere → wake the next
	//       pickup and point the player there.
	//   (B) every civilian for the day already exists (some aboard the heli,
	//       some still to deliver) → there's nothing more to pick up, so send
	//       the player HOME to the ship to unload.
	// We only act once self.civ_alive hits 0 (the present group is cleared)
	// and we've actually shown something here (civ_shown > 0), so this fires
	// after the player empties a spot, not on the very first tick.
	if ((self.civ_alive <= 0) && (self.civ_shown > 0)
		&& ((self.civ_shown >= CIV_WAITING_MAX) || (g_wave_spawned >= g_wave_quota)))
	{
		if ((g_wave_spawned < g_wave_quota))
		{
			// (A) More to create → next pickup.
			rotate_objective();
			if ((g_objective_active != world) && (g_objective_active != self))
			{
				sound(g_objective_active, CHAN_VOICE, "misc/secret.wav", 1, ATTN_NONE);
				g_objective_active.puff_suppress_until = (time + PICKUP_HANDOFF_QUIET);
				self.civ_shown = 0;   // this spot is spent for now
			}
		}
		else
		{
			// (B) Everyone for the day exists; nothing left to pick up here.
			// Tell the player to return to the ship to deliver. Stop puffing
			// (this spot is empty) and only nag once.
			self.puff_suppress_until = (time + 99999);
			if (!self.civ_sent_home)
			{
				self.civ_sent_home = 1;
				Objective_AnnounceReturn();
			}
		}
	}
};

void() info_pickup =
{
	precache_model("progs/player.mdl");
	precache_model("progs/puff_g.spr");
	precache_model("progs/puff_g2.spr");
	precache_model("progs/puff_g3.spr");
	precache_model("progs/puff_g4.spr");
	precache_model("progs/puff_g5.spr");
	precache_sound("items/r_item1.wav");
	precache_sound("misc/secret.wav");   // happy chime on batch handoff

	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_NONE;
	setsize(self, '-8 -8 -8', '8 8 8');
	self.classname = "info_pickup";
	self.model = "";
	setmodel(self, "");

	// Settle on the real ground. The editor leaves the marker ~64u above the
	// terrain, and a SOLID_TRIGGER does NOT fall with MOVETYPE_TOSS (triggers
	// don't collide), so we must snap it down ourselves: trace from above the
	// marker straight down and put it on whatever solid we hit. Civilians and
	// the puff column then use this corrected origin_z as ground level.
	traceline(self.origin + '0 0 64', self.origin - '0 0 2048', TRUE, self);
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		setorigin(self, trace_endpos);
	}

	self.think = pickup_think;
	self.nextthink = (time + 1);
};

// ---------------------------------------------------------------------
// info_ship
// ---------------------------------------------------------------------

void() rotate_objective;

// TRUE when at least one piloting player should be heading to the ship to
// deliver: they carry passengers AND there's nothing left to rescue right now
// (everyone for the day is created/aboard) OR their heli is full. This is the
// same "go home" condition the mission line / compass use, evaluated globally
// so the ship can raise its smoke beacon.
float() Deliver_IsActive =
{
	local entity client;
	local float more_to_rescue;

	more_to_rescue = 0;
	if ((g_wave_left > 0)) { more_to_rescue = 1; }
	if ((g_wave_spawned < g_wave_quota)) { more_to_rescue = 1; }

	client = find(world, classname, "player");
	while (client != world)
	{
		if ((client.pax >= PICKUP_CAPACITY) || (!more_to_rescue && (client.pax > 0)))
		{
			return (TRUE);
		}
		client = find(client, classname, "player");
	}
	return (FALSE);
};

// Nearest entity of `cls` to a point (world if none).
entity(string cls, vector org) nearest_of =
{
	local entity s;
	local entity best;
	local float bestd;
	local float d;

	best = world;
	bestd = 0;
	s = find(world, classname, cls);
	while (s != world)
	{
		d = vlen((s.origin - org));
		if ((best == world) || (d < bestd))
		{
			best = s;
			bestd = d;
		}
		s = find(s, classname, cls);
	}
	return (best);
};

// Where a disembarked passenger should run: the nearest info_ship_goal (the
// dedicated rally point placed on the deck). Falls back to the nearest
// info_ship if a map has no goal marker (old maps), so delivery still works.
entity(vector org) nearest_goal =
{
	local entity g;

	g = nearest_of("info_ship_goal", org);
	if (g == world)
		g = nearest_of("info_ship", org);
	return (g);
};

// Per-tick behaviour of a disembarked passenger. PURE DECORATION: the day
// quota was ALREADY credited when this pax left the heli (see ship_check), so
// nothing here can break the gameplay loop. The little guy just jogs to the
// goal and vanishes on arrival; if it ever gets stuck, a hard timeout removes
// it so it can't pile up forever.
void() disembark_pax_think =
{
	local vector dir;
	local float dist;
	local float yaw;
	local float step;
	local vector move;
	local vector dst;
	local float tk;

	self.think = disembark_pax_think;
	self.nextthink = (time + CIV_THINK_INTERVAL);

	// Anti-stuck safety net: vanish after DPAX_LIFETIME seconds no matter what
	// (self.pain_finished is set to the deadline at spawn). A wedged pax never
	// lingers — and since the quota is already counted, this is purely cosmetic.
	if ((self.dpax_ship == world) || (time > self.pain_finished))
	{
		remove(self);
		return;
	}

	dir = (self.dpax_ship.origin - self.origin);
	dir_z = 0;
	dist = vlen(dir);

	// Arrived: little sound, vanish. (Quota already credited at disembark.)
	if (dist <= DPAX_ARRIVE_DIST)
	{
		sound(self, CHAN_VOICE, "items/r_item2.wav", 1, ATTN_NORM);
		remove(self);
		return;
	}

	yaw = vectoyaw(dir);
	self.angles_y = yaw;
	self.ideal_yaw = yaw;

	// Waving "thanks" pause: STOP, TURN AROUND to face the rescuer (the heli)
	// and wave for a moment, then carry on to the goal. Facing back toward the
	// player is what sells the "stops, turns, says thanks" beat. The wave is a
	// little arm/pose bob cycled through a couple of frames.
	if (self.dpax_wave_until > time)
	{
		if (self.enemy != world)
		{
			yaw = vectoyaw(self.enemy.origin - self.origin);
			self.angles_y = yaw;
		}
		// Bob between two upright frames at ~5 Hz so the figure visibly waves
		// rather than standing frozen. (tick mod 2 via floor arithmetic.)
		tk = floor(time * 5);
		if ((tk - (floor(tk * 0.5) * 2)) == 0)
			self.frame = CIV_STAND_FRAME;
		else
			self.frame = (CIV_STAND_FRAME + 1);
		return;
	}

	// Wave ONCE, and only the ~30% of pax chosen at spawn (civ_state == 1).
	// Trigger it once they're past the halfway point to the goal so the turn
	// happens out in the open, not right next to the heli. After waving, clear
	// the flag so this pax never waves again — that's what makes it "one every
	// now and then" instead of everyone waving constantly.
	if ((self.civ_state == 1) && (dist <= self.dmg))   // dmg = halfway distance
	{
		self.civ_state = 0;                            // consume: wave only once
		self.dpax_wave_until = (time + DPAX_WAVE_TIME);
		if (self.enemy != world)
		{
			self.angles_y = vectoyaw(self.enemy.origin - self.origin);
		}
		return;
	}

	// Walk toward the goal. NON-SOLID (NOCLIP): move the origin by hand so we
	// never collide / get stuck. HEIGHT: the goal sits ON the deck (it settled
	// to the ground at spawn), so its Z is the correct deck height. We keep the
	// pax's feet at the goal's Z — robust and trace-free, so they can NEVER end
	// up floating. (A downward trace was unreliable here: starting from a
	// drifted/in-solid point it failed and left them hovering.)
	step = (DPAX_RUN_SPEED * CIV_THINK_INTERVAL);
	move = (normalize(dir) * step);
	dst = (self.origin + move);
	// Match the goal's Z exactly: the goal sits ON the deck (its origin IS
	// ground level — confirmed by debug: goalZ == groundZ == 128), so the pax
	// origin goes to the same Z, no offset. (+24 was wrong and made them float
	// 24u above the deck.)
	dst_z = self.dpax_ship.origin_z;
	setorigin(self, dst);

	self.walkframe = (self.walkframe + 1);
	if ((self.walkframe > 6)) { self.walkframe = 0; }
	self.frame = self.walkframe;        // walk cycle (frames 0..6)
};

// Drop ONE passenger out of `heli`, landing on the ground near it, then it
// runs to the nearest ship goal. Spawned staggered (one every
// DPAX_DROP_INTERVAL) by ship_check.
void(entity heli) spawn_disembark_pax =
{
	local entity c;
	local vector org;
	local float ang;
	local entity goal;

	c = spawn();
	c.classname = "disembark_pax";
	// Non-solid + NOCLIP: pure decoration that walks to the goal THROUGH the
	// heli/containers/anything, so it can never get stuck (the quota was
	// already credited at disembark). disembark_pax_think moves the origin by
	// hand and hugs the ground with a downward trace.
	c.solid = SOLID_NOT;
	c.movetype = MOVETYPE_NOCLIP;
	setmodel(c, "progs/player.mdl");
	setsize(c, '-12 -12 -24', '12 12 24');

	// Friendly faction so the reticle stays green and they take no friendly
	// fire weirdness; harmless decoration on their way to the ship.
	c.team = 1;
	c.ts = T1;
	c.takedamage = DAMAGE_NO;

	// Decide WHERE to land first: prefer the goal as the floor reference (the
	// deck height we want them on), falling back to the heli. Settle onto the
	// deck with droptofloor so they never float.
	goal = nearest_goal(heli.origin);

	// Spawn on the side of the heli that FACES THE GOAL, so they step out
	// already pointing at the destination instead of behind the heli where
	// they'd have to climb over it (the old random angle did exactly that and
	// they got stuck). A small random yaw spread keeps them from stacking on
	// one spot. If there's no goal, fall back to a random side.
	if (goal != world)
	{
		ang = vectoyaw(goal.origin - heli.origin) + ((random() - 0.5) * 50);
	}
	else
	{
		ang = (random() * 360);
	}
	makevectors(ang * '0 1 0');
	// Horizontal spawn spot just outside the heli's footprint, goal-ward.
	org = (heli.origin + (v_forward * 48));
	// Height: stand on the deck at the GOAL's exact Z (its origin IS deck level;
	// no offset, or they float 24u up). Same reference the walk loop uses.
	if (goal != world)
		org_z = goal.origin_z;
	else
		org_z = (heli.origin_z);
	setorigin(c, org);

	c.dpax_ship = goal;            // run toward the rally goal (or ship fallback)
	c.enemy = heli;                // who to turn around and thank (the rescuer)
	// Will this pax wave? Only ~DPAX_WAVE_FRACTION of them, decided ONCE here
	// (civ_state: 1 = will wave once, 0 = never). dmg holds the halfway
	// distance to the goal — the wave triggers when it crosses that point.
	if (random() < DPAX_WAVE_FRACTION)
		c.civ_state = 1;
	else
		c.civ_state = 0;
	if (goal != world)
		c.dmg = (vlen(goal.origin - c.origin) * 0.5);
	else
		c.dmg = 0;
	c.frame = CIV_STAND_FRAME;
	c.dpax_wave_until = 0;
	c.pain_finished = (time + DPAX_LIFETIME);   // hard despawn deadline

	// Little drop-out sound, desynced channel from the arrival sound.
	sound(c, CHAN_BODY, "items/r_item1.wav", 1, ATTN_NORM);

	c.think = disembark_pax_think;
	c.nextthink = (time + 0.05);
};

// Touched by anything inside its radius — we react only to a landed heli
// piloted by a player with at least 1 passenger.
void() ship_check =
{
	local entity client;
	local entity heli;
	local float earned;
	local vector puffpos;
	local float ang;
	local float rad;

	// Hospital slot release: a hospital frees one bed every hosp_rate seconds
	// (ships use hosp_rate too; if a point has a rate, tick it here so the one
	// shared ship_check covers both — info_hospital no longer needs its own
	// divergent think). Skipped when destroyed.
	if ((self.hosp_cap > 0) && !self.hosp_destroyed && (self.hosp_rate > 0))
	{
		if ((time >= self.hosp_next_release))
		{
			if ((self.hosp_pax > 0)) { self.hosp_pax = (self.hosp_pax - 1); }
			self.hosp_next_release = (time + self.hosp_rate);
		}
	}

	// Can this drop-off still receive survivors? A hospital/ship that is FULL
	// (no free slots) or destroyed shouldn't beckon — no smoke beacon, no
	// label — so the player isn't sent to a dead end. hosp_cap == 0 means the
	// old (uninitialised) deposit model: always available.
	local float canReceive;
	canReceive = 1;
	if ((self.hosp_cap > 0))
	{
		if (self.hosp_destroyed) { canReceive = 0; }
		if ((self.hosp_pax >= self.hosp_cap)) { canReceive = 0; }
	}

	// Sprite "prohibido" flotando sobre el punto mientras NO puede recibir
	// (lleno o destruido). Se oculta en cuanto vuelve a haber plazas. Solo
	// para puntos con capacidad real (hosp_cap > 0); los antiguos sin
	// capacidad siempre reciben y nunca muestran el símbolo.
	if ((self.hosp_cap > 0))
	{
		Ship_ShowNoEntry(self, !canReceive);
	}

	// Smoke beacon over the ship while DELIVER is active AND this point can
	// still take people, same as the pickup marker so the player can spot where
	// to drop the survivors off. Tick fast (0.1s) while puffing so the column is
	// as dense as the pickup's; idle at 0.25s otherwise.
	if (Deliver_IsActive() && canReceive)
	{
		self.nextthink = (time + PICKUP_PUFF_INTERVAL);
		ang = (random() * 360);
		rad = (random() * PICKUP_PUFF_RADIUS);
		makevectors(ang * '0 1 0');
		puffpos = self.origin + (v_forward * rad);
		puffpos_z = self.origin_z + 16 + (random() * PICKUP_PUFF_Z_RANGE);
		pickup_spawn_puff(puffpos);
		// Floating "RETURN" label over the ship while there are passengers to
		// unload here.
		WorldText_Set(self, WT_RETURN);
	}
	else
	{
		self.nextthink = (time + 0.25);
		// Nothing to deliver right now, or this point is full/destroyed → hide
		// the label and stop puffing.
		WorldText_Set(self, -1);
	}
	self.think = ship_check;

	client = find(world, classname, "player");
	while (client != world)
	{
		heli = client.enemy;
		if ((heli != world) && (heli.owner == client) && heli.landed)
		{
			if ((vlen((heli.origin - self.origin)) <= SHIP_ACTIVE_RADIUS))
			{
				// Reparacion gradual mientras el heli esta posado aqui — lleve
				// o no pasajeros. Un barco hundido / hospital destruido no cura
				// (lo comprueba Hospital_RepairVehicle).
				Hospital_RepairVehicle(self, heli);
				if (client.pax > 0)
				{
					// Staggered unload: drop ONE passenger at a time (every
					// DPAX_DROP_INTERVAL) instead of zeroing pax instantly.
					// Each dropped pax runs to the ship and credits the quota
					// on arrival (see disembark_pax_think). Crediting money +
					// hospital intake happens here, per passenger, as it leaves
					// the heli — so the wallet ticks up one-by-one too.
					if (time >= client.dpax_next_drop)
					{
						// hosp_cap == 0 → mapa antiguo; usa SHIP_DEPOSIT_CREDITS.
						if ((self.hosp_cap > 0))
						{
							earned = Hospital_Receive(self, 1);
						}
						else
						{
							earned = SHIP_DEPOSIT_CREDITS;
						}
						if ((earned > 0))
						{
							client.credits = (client.credits + earned);
							client.pax = (client.pax - 1);
							client.civ_saved = (client.civ_saved + 1);  // run stat
							client.dpax_next_drop = (time + DPAX_DROP_INTERVAL);
							// Quota advances NOW (at disembark), deterministic —
							// a stuck survivor can't block the day. The running
							// civilian is pure decoration.
							Day_OnDelivered(1);
							spawn_disembark_pax(heli);
							if (client.pax <= 0)
							{
								client.stars = 0;
								sprint(client, "all survivors delivered\n");
							}
						}
						else
						{
							sprint(client, "hospital full or destroyed - find another\n");
						}
					}
				}
			}
		}
		client = find(client, classname, "player");
	}
};

// Muestra u oculta el sprite "prohibido" flotando sobre un barco/hospital. Se
// llama desde ship_check cada tick con show=1 cuando el punto NO puede recibir
// supervivientes (lleno o destruido) y show=0 cuando sí puede. El sprite se
// crea de forma perezosa la primera vez que hace falta y luego se enseña /
// esconde poniendo / quitando su modelo (no spawneamos uno nuevo cada vez).
float NOENTRY_FLOAT_Z = 96;   // altura sobre el origen del barco
void(entity ship, float show) Ship_ShowNoEntry =
{
	local entity s;

	s = ship.hosp_noentry;
	if (!show)
	{
		// No debe verse: si existe el sprite, lo dejamos sin modelo (oculto).
		if ((s != world) && (s.model != ""))
		{
			setmodel(s, "");
		}
		return;
	}

	// Debe verse. Crearlo si aún no existe.
	if (s == world)
	{
		s = spawn();
		s.classname = "hosp_noentry";
		s.solid = SOLID_NOT;
		s.movetype = MOVETYPE_NONE;
		setorigin(s, ship.origin + ('0 0 1' * NOENTRY_FLOAT_Z));
		ship.hosp_noentry = s;
	}
	// Asegurar el modelo puesto (puede haber sido ocultado antes).
	if ((s.model != "progs/noentry.spr"))
	{
		setmodel(s, "progs/noentry.spr");
		setorigin(s, ship.origin + ('0 0 1' * NOENTRY_FLOAT_Z));
	}
};

// Animated landing-flag decoration. A separate, non-solid sprite that stands
// on the ship's landing spot so the player can SEE where to set down. It just
// cycles its flutter frames; the info_ship stays the invisible landing trigger.
void() ship_flag_think =
{
	self.frame = self.frame + 1;
	if (self.frame >= 3) { self.frame = 0; }   // flag.spr has 3 flutter frames
	self.nextthink = (time + 0.2);
	self.think = ship_flag_think;
};

void(entity ship) spawn_ship_flag =
{
	local entity f;

	f = spawn();
	f.classname = "ship_flag";
	f.solid = SOLID_NOT;
	f.movetype = MOVETYPE_NONE;
	setmodel(f, "progs/flag.spr");
	// Stand it on the deck at the landing spot. The sprite is anchored at its
	// base, so place it at the ship's ground origin.
	setorigin(f, ship.origin);
	f.frame = 0;
	f.think = ship_flag_think;
	f.nextthink = (time + 0.2);
};

void() info_ship =
{
	precache_model("progs/flag.spr");
	precache_model("progs/player.mdl");        // disembarking passengers
	precache_sound("items/r_item1.wav");       // pax drop-out
	precache_sound("items/r_item2.wav");       // pax arrival at goal
	// Drop to the ground / deck so the landing-radius check is centred
	// at floor level rather than 64u above it.
	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_TOSS;
	setsize(self, '-8 -8 -8', '8 8 8');
	self.classname = "info_ship";
	self.model = "";
	setmodel(self, "");
	g_ship = self;
	Hospital_Init(self, 0);
	// Settle on the real ground/deck. The editor leaves the marker ~64u above
	// the surface and a SOLID_TRIGGER does NOT fall with MOVETYPE_TOSS, so we
	// snap it down ourselves (same as info_pickup). Otherwise the landing-radius
	// check and the flag end up floating 64u in the air.
	traceline(self.origin + '0 0 64', self.origin - '0 0 2048', TRUE, self);
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		setorigin(self, trace_endpos);
	}
	// Visible landing flag on the (now settled) spot.
	spawn_ship_flag(self);
	self.think = ship_check;
	self.nextthink = (time + 1);
};

// info_ship_goal — the spot disembarked passengers run TO (placed elsewhere on
// the deck, away from the landing flag). Pure marker: invisible, non-solid.
// Drops to the deck so its origin is at ground level for the arrival check.
void() info_ship_goal =
{
	self.solid = SOLID_NOT;
	self.movetype = MOVETYPE_TOSS;
	setsize(self, '-8 -8 -8', '8 8 8');
	self.classname = "info_ship_goal";
	self.model = "";
	setmodel(self, "");
	// Settle onto the deck (triggers don't fall): snap down so the goal's
	// origin_z is real ground level — pax use it as the floor to land on.
	traceline(self.origin + '0 0 64', self.origin - '0 0 2048', TRUE, self);
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		setorigin(self, trace_endpos);
	}
};

// ---------------------------------------------------------------------
// Active-objective rotation
// ---------------------------------------------------------------------

// Pick a NEW active pickup, preferring one DIFFERENT from the current active
// (so a batch handoff actually sends the player somewhere else). Falls back
// to the current one only if it's the only pickup on the map.
void() rotate_objective =
{
	local entity p;
	local entity prev;
	local entity pick;
	local float n;
	local float r;

	prev = g_objective_active;

	// Count candidates OTHER than the current active.
	n = 0;
	p = find(world, classname, "info_pickup");
	while (p != world)
	{
		if (p != prev)
		{
			n = (n + 1);
		}
		p = find(p, classname, "info_pickup");
	}

	if ((n <= 0))
	{
		// No alternative pickup. Keep the current one active if it exists.
		if (prev != world)
		{
			g_objective_active = prev;
			return;
		}
		g_objective_active = world;
		return;
	}

	// Pick the r-th candidate among those != prev.
	r = floor(random() * n);
	if ((r >= n)) { r = (n - 1); }
	pick = world;
	p = find(world, classname, "info_pickup");
	while (p != world)
	{
		if (p != prev)
		{
			if ((r <= 0))
			{
				pick = p;
				p = world;   // stop
			}
			else
			{
				r = (r - 1);
				p = find(p, classname, "info_pickup");
			}
		}
		else
		{
			p = find(p, classname, "info_pickup");
		}
	}

	g_objective_active = pick;
	// Fresh activation: reset its shown-counter so it can show a new group.
	pick.civ_shown = 0;
	pick.next_civilian = 0;
};

// Forward decl: definida más abajo en este archivo.
void() Purge_HandPlacedMonsters;

// Called from worldspawn after all entities are loaded. Picks the first
// active info_pickup at random, and warns if the map is missing entities.
void() objectives_init =
{
	local entity p;
	local float n_pickup;
	local float n_ship;

	n_pickup = 0;
	p = find(world, classname, "info_pickup");
	while (p != world)
	{
		n_pickup = n_pickup + 1;
		p = find(p, classname, "info_pickup");
	}
	n_ship = 0;
	p = find(world, classname, "info_ship");
	while (p != world)
	{
		n_ship = n_ship + 1;
		p = find(p, classname, "info_ship");
	}

	// Avisos al mapper si falta una entidad crítica (no es ruido de debug).
	if (n_pickup == 0)
	{
		bprint("[objectives] WARNING: no info_pickup in map\n");
	}
	if (n_ship == 0)
	{
		bprint("[objectives] WARNING: no info_ship in map - DELIVER mission won't work\n");
	}

	// Purga monstruos colocados a mano en el .map. Toda la población
	// enemiga debe entrar via info_enemy_slot. Los que ya estaban en el
	// mapa (pruebas viejas) se eliminan al worldspawn para no contaminar
	// la sesión.
	Purge_HandPlacedMonsters();

	rotate_objective();
};

// Borra todos los monstruos del mapa que no fueron spawneados por un
// info_enemy_slot (los que tienen from_slot == 0). Esto incluye AAGs,
// SAMs, radares, tanques, helis, drones, swarmpilots y humvees colocados
// directamente como entidades en el editor.
void() Purge_HandPlacedMonsters =
{
	local entity m;
	local entity next_m;
	local float purged;

	purged = 0;

	// Para cada classname conocido, recorre y elimina los que NO vienen
	// de slot. Usamos next_m porque remove(self) invalida self.chain.
	m = find(world, classname, "monster_aag");
	while (m)
	{
		next_m = find(m, classname, "monster_aag");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_amg");
	while (m)
	{
		next_m = find(m, classname, "monster_amg");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_sam");
	while (m)
	{
		next_m = find(m, classname, "monster_sam");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_rad");
	while (m)
	{
		next_m = find(m, classname, "monster_rad");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_etank");
	while (m)
	{
		next_m = find(m, classname, "monster_etank");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_ehmmv");
	while (m)
	{
		next_m = find(m, classname, "monster_ehmmv");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_emsam");
	while (m)
	{
		next_m = find(m, classname, "monster_emsam");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_drone");
	while (m)
	{
		next_m = find(m, classname, "monster_drone");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_drone2");
	while (m)
	{
		next_m = find(m, classname, "monster_drone2");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_helo");
	while (m)
	{
		next_m = find(m, classname, "monster_helo");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}
	m = find(world, classname, "monster_swarm_pilot");
	while (m)
	{
		next_m = find(m, classname, "monster_swarm_pilot");
		if (!m.from_slot) { remove(m); purged = (purged + 1); }
		m = next_m;
	}

	if ((purged > 0))
	{
		bprint("[objectives] purged ");
		bprint(ftos(purged));
		bprint(" hand-placed monster(s); use info_enemy_slot instead.\n");
	}
};

// Called once per PlayerPreThink. Decides which entity the HUD pointer
// should aim at (pickup if not full, ship if full or carrying anyone)
// and writes the precomputed HUD fields to the player. We compute dot
// products against the player's view server-side because ironwail's CSQC
// doesn't expose getproperty(VF_ORIGIN/VF_CL_VIEWANGLES).
//   obj_kind = 0 → pickup; 1 → ship; -1 → none.
void() Objectives_HudTick =
{
	local entity target;
	local entity ref;
	local float kind;
	local vector to;
	local vector ang;

	target = world;
	kind = -1;

	// Dia 5 (DAY_MAX): mision del VIP/representante, no el bucle normal de
	// rescate. La guia de direccion debe apuntar al representante (recogerlo)
	// y, una vez a bordo, al portaaviones (llevarlo) — igual que el pickup de
	// civiles tiene su flecha. Reutilizamos los kinds existentes para no tocar
	// el compas del CSQC: kind 0 (verde, "ve a por el") para recoger, kind 1
	// (azul, "entrega") para el carrier.
	if ((g_day >= DAY_MAX))
	{
		if (self.has_rep)
		{
			// Lleva al VIP → apunta al portaaviones.
			target = find(world, classname, "info_carrier");
			kind = 1;
		}
		else
		{
			// Aun no lo ha recogido → apunta al representante. (Se elimina al
			// subir a bordo; en ese instante has_rep ya es 1 y apuntamos al
			// carrier en la rama de arriba.)
			target = find(world, classname, "info_representative");
			kind = 0;
		}
		if (target == world) { kind = -1; }  // marcador aun no colocado en el mapa
	}
	else
	{
		local float more_to_rescue;

		// Civilians still to rescue this day: any alive in the field now, or
		// still to be created. (Same rule as the bottom mission line.)
		more_to_rescue = 0;
		if ((g_wave_left > 0)) { more_to_rescue = 1; }
		if ((g_wave_spawned < g_wave_quota)) { more_to_rescue = 1; }

		// Carrying any pax → DELIVER. Always point at the ship while the
		// player has survivors aboard, regardless of whether more are waiting
		// at a pickup. Finish the current run first; the compass flips to the
		// pickup automatically once pax reaches 0.
		if (self.pax > 0)
		{
			target = g_ship;
			if (target != world) { kind = 1; }   // DELIVER → ship
			else                 { kind = 2; }   // pax but no ship placed
		}
		// No pax: if civilians still to rescue, point at the pickup.
		else if (more_to_rescue && (g_objective_active != world))
		{
			target = g_objective_active;
			kind = 0;                              // PICKUP → active objective
		}
	}

	if (target == world)
	{
		// Either nothing placed (kind stays -1) or pax-full with no ship
		// (kind=2). In both cases obj_dist/dotfwd are meaningless.
		self.obj_kind = kind;
		self.obj_dist = 0;
		self.obj_dotfwd = 0;
		self.obj_dotrgt = 0;
		Mission_SetLine();   // keep hud_mission current even with no compass target
		return;
	}

	// Use the piloted vehicle's origin and angles if available, otherwise
	// fall back to the player on foot.
	ref = self;
	if ((self.enemy.owner == self))
	{
		ref = self.enemy;
	}

	to = (target.origin - ref.origin);
	to_z = 0;
	self.obj_dist = vlen(to);
	if (self.obj_dist < 1)
	{
		// Sitting on top of marker. Pretend it's straight ahead so HUD
		// shows no arrow and no NaN propagates downstream.
		self.obj_dotfwd = 1;
		self.obj_dotrgt = 0;
		self.obj_kind = kind;
		return;
	}
	to = normalize(to);

	ang = ref.angles;
	// In Quake angles[0] (pitch) flips for makevectors. For the helo we want
	// a purely horizontal forward, so zero the pitch component.
	ang_x = 0;
	makevectors(ang);
	self.obj_dotfwd = (to * v_forward);
	self.obj_dotrgt = (to * v_right);
	self.obj_kind = kind;
	// Absolute bearing to the target (world yaw) for the compass marker.
	self.obj_bearing = vectoyaw(to);
	Mission_SetLine();
};

// Set the persistent bottom mission line (STAT_HUD_MISSION) from the current
// state. Codes: 0 none, 1 "fly to the marked pickup", 2 "pick up survivors",
// 3 "RETURN — deliver survivors to the ship". The day is done once enough
// have been DELIVERED, so the rule is:
//   - more civilians left to rescue this day (waiting now, or still to
//     create) → go pick them up (1 if none waiting yet at the active spot,
//     2 once a group is present);
//   - otherwise (everyone for the day is already aboard / delivered) and you
//     still carry passengers → RETURN to the ship to deliver (3).
void() Mission_SetLine =
{
	local float more_to_rescue;

	// Mirror the current day number + quota to the player for the CSQC "DAY n"
	// badge and the day-briefing curtain.
	self.hud_day = g_day;
	self.hud_quota = g_wave_quota;

	// Day 5 is the representative evac, not the normal rescue loop:
	//   carrying the rep  → "fly to the carrier" (5)
	//   not yet           → "pick up the representative" (4)
	if ((g_day >= DAY_MAX))
	{
		if (self.has_rep)
			self.hud_mission = 5;
		else
			self.hud_mission = 4;
		return;
	}

	// Civilians still in the field to rescue, or yet to be created this day.
	more_to_rescue = 0;
	if ((g_wave_left > 0)) { more_to_rescue = 1; }
	if ((g_wave_spawned < g_wave_quota)) { more_to_rescue = 1; }

	if (more_to_rescue)
	{
		if ((g_objective_active != world) && (g_objective_active.civ_alive > 0))
		{
			self.hud_mission = 2;   // a group is waiting at the active spot
		}
		else
		{
			self.hud_mission = 1;   // head to the marked pickup
		}
	}
	else if ((self.pax > 0))
	{
		self.hud_mission = 3;       // nothing left to grab → deliver to ship
	}
	else
	{
		self.hud_mission = 0;       // day's deliveries done / nothing to do
	}
};

// One-shot feedback when a pickup runs out of survivors and there are no more
// to create this day: tell every piloting player to return to the ship.
void() Objective_AnnounceReturn =
{
	local entity p;
	p = find(world, classname, "player");
	while (p != world)
	{
		centerprint(p, "All survivors aboard\nRETURN to the ship to deliver");
		sound(p, CHAN_VOICE, "misc/secret.wav", 1, ATTN_NONE);
		p = find(p, classname, "player");
	}
};

// Called once per PlayerPreThink. Computes the DANGER banner state for
// the CSQC HUD:
//   1  → white    (above stealth altitude, no radar lock)
//   2  → red      (above stealth altitude AND a radar has lock)
//   3  → "HIDDEN" (safe: effectively hidden in a cloud, OR flying low in
//                  sigilo — both stealth modes show the green HIDDEN badge)
// Stealth altitude matches the rule in rad.qc (RadFindTarget + rad_stand):
// 128u (≈2 pips at HEIGHT_UNIT=64) over the surface directly below.
// We measure from the piloted vehicle if any, otherwise from the player.
// Sun lens-flare data for the CSQC overlay. This engine's CSQC can't read the
// camera or traceline, so we compute it here each PreThink and ship it via
// stats. The sun direction matches the map mangle '215 -45 0' (az 215, el
// +45) used by the editor/cloudGen: SUN3D = (cos az cos el, sin az cos el,
// sin el) ≈ (-0.580, -0.406, 0.707). We dot it with the player's view axes
// (so CSQC can place the flare on screen) and traceline from the eye toward
// the sun to detect SOLID occlusion (terrain/buildings). Clouds are
// non-solid, so they don't block it (by design).
// Sun direction (toward the sun) used to place the lens flare. The skybox
// sun reads as coming from the opposite azimuth to the lighting mangle, so we
// flip the horizontal component (azimuth +180°) and keep the high elevation
// (Z up). Tweak this vector if the flare doesn't sit on the skybox sun.
vector SUN_DIR = '0.580 0.406 0.707';
float  SUN_TRACE_FAR = 16384;

void() Sun_FlareTick =
{
	// Sun direction projected on the player's view axes. We DON'T trace for
	// occlusion (the sealed sky box made that unreliable) — the flare simply
	// shows whenever the sun is in front of the camera. The CSQC fades it as
	// the sun moves off-axis.
	makevectors(self.v_angle);
	self.sun_fwd = (SUN_DIR * v_forward);
	self.sun_rt  = (SUN_DIR * v_right);
	self.sun_up  = (SUN_DIR * v_up);
	self.sun_vis = (self.sun_fwd > 0.05);   // 1 if the sun is in front
};

// Stealth (cloud hide or low flight) takes priority: the DANGER banner is
// replaced by a "HIDDEN" badge regardless of radar lock.
void() Stealth_HudTick =
{
	if (Stars_CloudHidden() || (Stars_AltOverGround() <= SIGILO_MAX_ALT))
	{
		self.hud_danger = 3;     // HIDDEN — cloud or low-flight sigilo
	}
	else if ((self.radar_locked_until > time))
	{
		self.hud_danger = 2;
	}
	else
	{
		self.hud_danger = 1;
	}
};

// ---------------------------------------------------------------------
// info_hospital  (paquete con cap 6, ritmo 4s, +400 cr/pax)
// ---------------------------------------------------------------------

// info_hospital now shares ship_check entirely: it gets the SAME smoke beacon,
// landing flag, "RETURN" label, staggered disembark, and full/destroyed gating
// as the ship. The hospital's bed-release tick lives inside ship_check too (it
// runs for any drop-off with a hosp_rate). So a hospital and a ship behave
// identically as drop-off points, only their cap/rate/reward differ.
void() info_hospital =
{
	precache_model("progs/flag.spr");
	precache_model("progs/player.mdl");
	precache_sound("items/r_item1.wav");
	precache_sound("items/r_item2.wav");

	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_TOSS;
	setsize(self, '-8 -8 -8', '8 8 8');
	self.classname = "info_hospital";
	self.model = "";
	setmodel(self, "");
	Hospital_Init(self, 1);

	// Settle onto the ground (triggers don't fall with MOVETYPE_TOSS) so the
	// landing flag and radius check sit at surface level, not 64u up.
	traceline(self.origin + '0 0 64', self.origin - '0 0 2048', TRUE, self);
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		setorigin(self, trace_endpos);
	}
	// Visible landing flag on the (settled) spot, same as the ship.
	spawn_ship_flag(self);

	self.think = ship_check;
	self.nextthink = (time + 1);
};

// ---------------------------------------------------------------------
// info_carrier  (portaaviones de USA, día 5)
// ---------------------------------------------------------------------
//
// Aterrizar dentro de SHIP_ACTIVE_RADIUS con el representante a bordo
// (.has_rep == 1) gana el juego. (.has_rep declarado arriba, junto a rep_flag.)

void() gamewon_fire_gameover =
{
	gameover = 1;
};

void() carrier_check =
{
	local entity client;
	local entity heli;
	local entity relay;

	self.nextthink = (time + 0.25);
	self.think = carrier_check;

	client = find(world, classname, "player");
	while (client != world)
	{
		heli = client.enemy;
		if ((heli != world) && (heli.owner == client) && heli.landed)
		{
			if ((vlen((heli.origin - self.origin)) <= SHIP_ACTIVE_RADIUS))
			{
				if (client.has_rep)
				{
					client.has_rep     = 0;
					client.hud_gamewon = 1;
					bprint("=== Representative delivered. Mission accomplished! ===\n");
					sound(heli, CHAN_ITEM, "items/r_item2.wav", 1, ATTN_NORM);
					// Let the CSQC screen show for 15s before the engine restarts.
					relay = spawn();
					relay.think     = gamewon_fire_gameover;
					relay.nextthink = (time + 15);
				}
			}
		}
		client = find(client, classname, "player");
	}
};

void() info_carrier =
{
	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_NONE;
	setsize(self, '-8 -8 -8', '8 8 8');
	self.classname = "info_carrier";
	self.model = "";
	setmodel(self, "");
	self.think = carrier_check;
	self.nextthink = (time + 1);
};

// ---------------------------------------------------------------------
// info_representative  (NPC nombrado del día 5)
// ---------------------------------------------------------------------

// Smoke + worldtext beacon for the representative — runs every 0.1 s once the
// rep is activated on day 5.
void() rep_think =
{
	local vector puffpos;
	local float ang;
	local float rad;

	WorldText_Set(self, WT_EXTRACTION);

	ang = (random() * 360);
	rad = (random() * PICKUP_PUFF_RADIUS);
	makevectors(ang * '1 0 0');
	puffpos = self.origin + (v_forward * rad);
	puffpos_z = (self.origin_z + 16 + (random() * PICKUP_PUFF_Z_RANGE));
	pickup_spawn_puff(puffpos);

	self.think = rep_think;
	self.nextthink = (time + PICKUP_PUFF_INTERVAL);
};

void() rep_touch =
{
	local entity plyr;

	// The player flies a heli, so what touches this trigger is usually the
	// VEHICLE (other.owner == the player), not the player on foot. Accept both:
	// resolve the actual player either way. (This is why the rep "wouldn't get
	// in" — the old check only matched a bare player entity.)
	plyr = other;
	if ((other.owner.classname == "player"))
	{
		plyr = other.owner;
	}
	if ((plyr.classname != "player"))
	{
		return;
	}
	// Only board when the heli is actually set down (not skimming overhead).
	if ((other.owner == plyr) && !other.landed)
	{
		return;
	}

	plyr.has_rep = 1;
	sprint(plyr, "Representative on board. Head to the carrier.\n");
	sound(plyr, CHAN_ITEM, "items/r_item1.wav", 1, ATTN_NORM);
	WorldText_Set(self, -1);
	if ((self.rep_flag != world)) { remove(self.rep_flag); }
	remove(self);
};

void() info_representative =
{
	precache_model("progs/flag.spr");
	precache_model("progs/worldtext.spr");
	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_TOSS;
	setsize(self, '-16 -16 -24', '16 16 32');
	self.classname = "info_representative";
	self.touch = rep_touch;
	// Sólo aparece en día 5. world.qc lo dejará invisible hasta entonces.
};

// ---------------------------------------------------------------------
// info_enemy_slot  (posición candidata de enemigo)
// ---------------------------------------------------------------------
//
// El mapper coloca info_enemy_slot con .enemy_kind = "monster_aag" /
// "monster_sam" / etc., y opcionalmente .activate_day (día mínimo). Cada
// día, el sistema activa un porcentaje de los slots (Day_SlotActivationPct).
// Slots activados spawnean el monstruo y se eliminan.

.string enemy_kind;
.float activate_day;
.float slot_activated;

// "Despierta" el monstruo que el slot pre-spawneó al worldspawn.
// En ironwail, precache_model() está prohibido fuera de funciones spawn
// (worldspawn + las que el engine llama mientras carga el .bsp). Por eso
// no podemos crear el monstruo mid-game — su constructor llamaría
// precache_model y reventaría. Solución: en info_enemy_slot() (que SÍ
// es spawn function) creamos el monstruo desde el principio y lo
// dejamos dormido con SOLID_NOT / MOVETYPE_NONE / takedamage=NO.
// Aquí simplemente lo activamos.
void() slot_wake_enemy =
{
	local entity m;

	m = self.tur1;        // referencia al monstruo pre-spawneado
	if ((m == world))
	{
		return;
	}
	m.solid = SOLID_BBOX;
	if ((m.movetype == 0))
	{
		m.movetype = MOVETYPE_STEP;
	}
	m.takedamage = DAMAGE_AIM;
	m.nextthink = (time + 0.1);
};

void() slot_think =
{
	local float pct;
	local float r;
	local float min_day;

	self.nextthink = (time + 2);

	if (self.slot_activated)
	{
		return;
	}
	min_day = self.activate_day;
	if ((min_day <= 0))
	{
		min_day = 1;
	}
	if ((g_day < min_day))
	{
		return;
	}
	pct = Day_SlotActivationPct();
	r = random();
	if ((r > pct))
	{
		return;
	}
	self.slot_activated = 1;
	slot_wake_enemy();
	remove(self);
};

// info_enemy_slot:
//   - Pre-spawnea el monstruo en su sitio (DORMIDO) al cargar el mapa.
//     Esto se hace dentro de la spawn function, así que precache_model()
//     dentro de monster_aag()/sam()/rad() es legal.
//   - Guarda el monstruo en self.tur1 para despertarlo más tarde.
//   - Marca al monstruo dormido: SOLID_NOT, MOVETYPE_NONE, takedamage=NO,
//     nextthink=0. Invisible y pasivo hasta que el slot decide activarlo.
void() info_enemy_slot =
{
	local entity m;
	local entity prev_self;

	self.classname = "info_enemy_slot";
	self.slot_activated = 0;

	// Spawnea el monstruo dormido. Cambiar self → m, llamar constructor,
	// volver a self. monster_aag() precachea modelos; estamos en spawn
	// function via info_enemy_slot, así que es legal.
	m = spawn();
	m.origin = self.origin;
	m.angles = self.angles;
	m.from_slot = 1;
	prev_self = self;
	self = m;
	if ((prev_self.enemy_kind == "monster_aag"))
	{
		monster_aag();
	}
	else
	{
		if ((prev_self.enemy_kind == "monster_sam"))
		{
			monster_sam();
		}
		else
		{
			if ((prev_self.enemy_kind == "monster_rad"))
			{
				monster_rad();
			}
		}
	}
	// Dormir al monstruo. SOLID_NOT lo hace intangible y MOVETYPE_NONE
	// lo congela; nextthink=0 cancela su AI loop. El modelo se queda
	// visible (un cañón "apagado") — es razonable narrativamente y nos
	// ahorra tener que reconstruir el modelo al despertar.
	m.solid = SOLID_NOT;
	m.movetype = MOVETYPE_NONE;
	m.takedamage = DAMAGE_NO;
	m.nextthink = 0;
	self = prev_self;

	// El slot guarda la referencia para despertarlo más tarde.
	self.tur1 = m;
	self.solid = SOLID_NOT;
	self.movetype = MOVETYPE_NONE;
	self.model = "";
	setmodel(self, "");
	self.think = slot_think;
	self.nextthink = (time + 1);
};

// ---------------------------------------------------------------------
// Pressure wave: each send drops a flight of raider helos that PATROL a ring
// around ONE pickup, strafing the civilians there with their machine gun, and
// turning on the player only when the player comes within 500u. Called from
// Objectives_RotateDay (days 2-5) and Day_Tick (day 1).
// ---------------------------------------------------------------------
float PRESS_HELOS_PER_SEND = 3;   // helos per send, all guarding ONE pickup

float PRESS_MAX_ALIVE = 9;   // cap on concurrent raider helos (perf + balance)

void() Pressure_SpawnWave =
{
	local entity p;
	local entity chosen;
	local float total;
	local float pickn;
	local float i;
	local float alive;

	// Don't pile up forever: skip this send if there are already plenty of
	// raider helos in the air (sends come every 12s, so without a cap they'd
	// accumulate without bound).
	alive = 0;
	p = find(world, classname, "press_helo");
	while (p) { alive = (alive + 1); p = find(p, classname, "press_helo"); }
	if (alive >= PRESS_MAX_ALIVE) return;

	// Choose ONE pickup at random for this send.
	total = 0;
	p = find(world, classname, "info_pickup");
	while (p) { total = (total + 1); p = find(p, classname, "info_pickup"); }
	if (total <= 0) return;

	pickn = floor(random() * total);
	if (pickn >= total) { pickn = (total - 1); }
	chosen = world;
	i = 0;
	p = find(world, classname, "info_pickup");
	while (p)
	{
		if (i == pickn) { chosen = p; }
		i = (i + 1);
		p = find(p, classname, "info_pickup");
	}
	if (chosen == world) return;

	// hedrone.qc owns the ring/flight details (where the PRESS_* constants
	// live). It builds the shared patrol ring and drops the flight of helos
	// onto it, spread around the loop, each inbound from a bombing_launcher.
	spawn_pressure_flight(chosen);
	bprint("Raider helos inbound to a rescue zone.\n");
};

// ---------------------------------------------------------------------
// Day rotation hook (called from day.qc when wave advances)
// ---------------------------------------------------------------------

void() Objectives_RotateDay =
{
	local entity rep;
	local entity p;

	// Reset per-pickup state for the new day. The day quota is global
	// (g_wave_quota/g_wave_delivered, set in Day_Advance); pickups just show
	// groups of civilians. Clear each one's counters.
	p = find(world, classname, "info_pickup");
	while (p)
	{
		p.civ_alive = 0;            // waiting civilians from last day are gone
		p.civ_shown = 0;
		p.puff_suppress_until = 0;
		p = find(p, classname, "info_pickup");
	}

	if ((g_day == 5))
	{
		// Activate the representative pickup if present in the map.
		rep = find(world, classname, "info_representative");
		if (rep != world)
		{
			local entity f;
			// Settle the rep onto the ground (a SOLID_TRIGGER doesn't fall with
			// MOVETYPE_TOSS, so the editor marker stays ~64u up and both the rep
			// and its flag would float). Snap down like info_ship/info_pickup.
			traceline(rep.origin + '0 0 64', rep.origin - '0 0 2048', TRUE, rep);
			if ((trace_fraction < 1) && !trace_allsolid)
			{
				setorigin(rep, trace_endpos);
			}
			setmodel(rep, "progs/player.mdl");

			// Animated flag at the rep's feet (now on the settled ground).
			f = spawn();
			f.classname = "ship_flag";
			f.solid = SOLID_NOT;
			f.movetype = MOVETYPE_NONE;
			setmodel(f, "progs/flag.spr");
			setorigin(f, rep.origin);
			f.frame = 0;
			f.think = ship_flag_think;
			f.nextthink = (time + 0.2);
			rep.rep_flag = f;

			// Smoke beacon + worldtext label.
			rep.think = rep_think;
			rep.nextthink = (time + 0.1);

			bprint("The representative awaits at the marked location.\n");
		}
		else
		{
			bprint("[objectives] WARNING: day 5 reached but no info_representative in map\n");
		}
		return;
	}
	rotate_objective();
	// (Raider helo waves are sent periodically by Day_Tick every
	// PRESS_WAVE_PERIOD seconds, not per day-advance.)
};

// ---------------------------------------------------------------------
// Re-arm pickups after a passenger loss (called from day.qc when the heli
// crashes carrying pax). The day quota accounting (g_wave_spawned) already
// dropped so the day is still completable, but the pickups may have parked
// themselves: a pickup that had shown its cap (civ_shown) or sent the player
// home (civ_sent_home) won't spawn replacements. Clearing those flags lets
// them create the fresh civilians the player now has to go fetch — fixing the
// "everyone died and there's no one left to pick up" deadlock.
// ---------------------------------------------------------------------
void() Objectives_Rearm =
{
	local entity p;
	local float civcount;
	local entity e;

	// Recount REALITY rather than trusting g_wave_spawned (which drifts and is
	// what re-stuck the day before): how many civilians actually exist in the
	// world right now. The day still needs (quota - delivered) people total;
	// the ones that exist cover part of that, so g_wave_spawned should be
	// (delivered + alive). Set it so `want = quota - spawned` reflects the true
	// shortfall and the pickups top up exactly what's missing.
	civcount = 0;
	e = find(world, classname, "civilian");
	while (e)
	{
		civcount = (civcount + 1);
		e = find(e, classname, "civilian");
	}
	g_wave_spawned = (g_wave_delivered + civcount);
	if ((g_wave_spawned < 0)) { g_wave_spawned = 0; }
	g_wave_left = civcount;

	// If the day is genuinely covered (enough exist/delivered), nothing to do.
	if ((g_wave_spawned >= g_wave_quota))
	{
		return;
	}

	// Un-park every pickup so it can show a fresh batch and stop nagging "go
	// home". (civ_alive is left alone — it tracks live waiting civilians.)
	p = find(world, classname, "info_pickup");
	while (p)
	{
		p.civ_shown = 0;
		p.civ_sent_home = 0;
		p.puff_suppress_until = 0;
		p = find(p, classname, "info_pickup");
	}

	// Guarantee a usable active objective. Rotate if there's none, or if the
	// current one has nobody waiting (so the player actually gets pointed at a
	// pickup that's about to produce). pickup_think then starts spawning.
	if ((g_objective_active == world) || (g_objective_active.civ_alive <= 0))
	{
		rotate_objective();
	}
};
