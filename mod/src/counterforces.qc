// counterforces.qc — Davenport's defensive counter-attack.
//
// Every COUNTER_WAVE_PERIOD seconds a small wave of Davenport defense vehicles
// (armoured cars = monster_ehmmv) deploys near a `counterforces_origin` marker
// and sets off down the nearest ground patrol route (path_corner chain),
// hunting the player. They're enemy faction (T0) like every other hostile, so
// they use the standard FindTarget + star-gate engagement rules.
//
// When a car is destroyed it leaves behind an ammo-refill box and a repair
// box at the wreck, so taking them out is rewarded.
//
// Tunables: 2 cars per wave, staggered 3s apart. Easy to add more vehicle
// types later (spawn a different monster_* in cf_spawn_car).

float COUNTER_CARS_PER_WAVE = 2;     // vehicles per wave
float COUNTER_STAGGER       = 3;     // seconds between vehicles in a wave
float COUNTER_MAX_ALIVE     = 8;     // cap on concurrent counterforce vehicles

// Marks a vehicle as one of OUR counterforce spawns (so the cap counts only
// these, not editor-placed monsters of the same class).
.float cf_friendly;

// Forward decls (defined in earlier-compiled files).
void() monster_ehmmv;        // ehmmv.qc — the armoured car (machine gun)
void() monster_emsam;        // emsam.qc — the mobile anti-air vehicle (SAM)
void() etank_die;            // etank.qc — shared vehicle death (explosion)

// Death of a counterforce car: normal vehicle explosion. (Antes soltaba una
// caja de munición + una de reparación en el pecio; se quitó a petición del
// usuario — ya no aparecen cajitas al destruir vehículos.)
void() cf_car_die =
{
	etank_die();
};

// Nearest path_corner to `org` (world if the map has none). The car starts
// patrolling from here; the path_corner chain (.target → .targetname, advanced
// by t_movetarget on touch) carries it along the route.
entity(vector org) cf_find_nearest_corner =
{
	local entity e;
	local entity best;
	local float bestd;
	local float d;

	best = world;
	bestd = 0;
	e = find(world, classname, "path_corner");
	while (e)
	{
		d = vlen((e.origin - org));
		if ((best == world) || (d < bestd)) { best = e; bestd = d; }
		e = find(e, classname, "path_corner");
	}
	return (best);
};

// Pick a counterforces_origin marker to deploy from: the one nearest the
// active rescue objective if we know it, else a random one. world if none.
entity() cf_find_origin =
{
	local entity e;
	local entity best;
	local float bestd;
	local float d;
	local vector ref;

	// Reference point = the active pickup objective if set, else map origin.
	ref = '0 0 0';
	if ((g_objective_active != world)) { ref = g_objective_active.origin; }

	best = world;
	bestd = 0;
	e = find(world, classname, "counterforces_origin");
	while (e)
	{
		d = vlen((e.origin - ref));
		if ((best == world) || (d < bestd)) { best = e; bestd = d; }
		e = find(e, classname, "counterforces_origin");
	}
	return (best);
};

// Count alive combat units (FL_MONSTER, health > 0) for a given team string.
float(string tstr) cf_count_alive =
{
	local entity e;
	local float n;
	n = 0;
	e = find(world, ts, tstr);
	while (e)
	{
		if ((e.health > 0) && (e.flags & FL_MONSTER))
			n = (n + 1);
		e = find(e, ts, tstr);
	}
	return n;
};

// Extra vehicles to add to the next wave when enemies outnumber allies.
// Ratio > 2 → +1, ratio > 4 → +2.
float() cf_pressure_bonus =
{
	local float t0;
	local float t1;
	local float ratio;
	t0    = cf_count_alive(T0);
	t1    = cf_count_alive(T1) + 1;   // +1 avoids div-by-zero
	ratio = (t0 / t1);
	if (ratio > 4) return 2;
	if (ratio > 2) return 1;
	return 0;
};

// Spawn ONE counterforce vehicle at `spot`, set it onto the nearest ground
// patrol route, and give it the box-dropping death. RANDOMISES the vehicle:
// ~1/3 armoured car (monster_ehmmv) / ~1/3 mobile anti-air (monster_emsam)
// / ~1/3 main battle tank (monster_etank, friendly). All are MOVETYPE_STEP,
// follow path_corner via self.target, and use etank_die.
void(vector spot) cf_spawn_car =
{
	local entity m;
	local entity osave;
	local entity corner;

	m = spawn();
	setorigin(m, spot);
	// FRIENDLY to the player: Davenport defense units are ALLIES. team=1 makes
	// the constructor set ts=T1 (the player's side), so they hunt the player's
	// enemies (T0: swarm/helos/etc.) instead of the player, and the aim reticle
	// shows them green.
	m.team = 1;
	m.from_slot = 1;            // survive the day-start hand-placed purge
	m.cf_friendly = 1;          // mark as one of ours (for the alive cap)

	// Build it through the chosen constructor (model/AI/turrets/faction).
	// IMPORTANT: these constructors don't set self.classname (the editor/.map
	// normally does), so a runtime spawn would have an EMPTY classname and the
	// alive-cap find() would never see it → vehicles piled up without bound.
	// Set it explicitly to the real monster classname after building.
	local float rv;
	rv = random();
	osave = self;
	self = m;
	if (rv < 0.33)
	{
		monster_ehmmv();
		m.classname = "monster_ehmmv";
	}
	else if (rv < 0.67)
	{
		monster_emsam();
		m.classname = "monster_emsam";
	}
	else
	{
		monster_etank();
		m.classname = "monster_etank";
	}
	self = osave;

	// Attach to the nearest ground route. ehmmv_start reads self.target (a
	// targetname) to wire movetarget, but it's scheduled for a future think and
	// we have the corner now — set movetarget directly and let ehmmv_start fall
	// back to th_walk because movetarget is set... actually ehmmv_start checks
	// self.target, so wire .target to the corner's targetname AND set movetarget
	// so it works whether ehmmv_start runs before or after we return.
	corner = cf_find_nearest_corner(spot);
	if (corner != world)
	{
		m.target = corner.targetname;
		m.movetarget = corner;
		m.goalentity = corner;
	}

	// Box-dropping death (overrides the plain etank_die set by the constructor).
	m.th_die = cf_car_die;

	// droptofloor so it starts resting on the ground (the marker may sit a bit
	// above the surface). MOVETYPE_STEP + this keeps it grounded.
	setorigin(m, spot);
	droptofloor();
};

// Spawn the staggered cars of one wave. The first deploys now; the rest are
// queued one COUNTER_STAGGER apart via a tiny relay entity so we don't block.
void() cf_wave_relay =
{
	// self is the relay; self.owner carries the deploy spot, self.cnt how many
	// cars are left to drop.
	local vector spot;
	spot = self.origin;
	cf_spawn_car(spot);
	self.cnt = (self.cnt - 1);
	if (self.cnt > 0)
	{
		self.nextthink = (time + COUNTER_STAGGER);
		self.think = cf_wave_relay;
	}
	else
	{
		remove(self);
	}
};

void() Counterforces_SpawnWave =
{
	local entity org;
	local entity relay;
	local entity e;
	local float alive;
	local vector spot;

	// Cap concurrent counterforce vehicles so waves don't pile up without bound.
	// cf_friendly marks our own spawns so editor-placed monsters aren't counted.
	alive = 0;
	e = find(world, classname, "monster_ehmmv");
	while (e)
	{
		if (e.cf_friendly) { alive = (alive + 1); }
		e = find(e, classname, "monster_ehmmv");
	}
	e = find(world, classname, "monster_emsam");
	while (e)
	{
		if (e.cf_friendly) { alive = (alive + 1); }
		e = find(e, classname, "monster_emsam");
	}
	e = find(world, classname, "monster_etank");
	while (e)
	{
		if (e.cf_friendly) { alive = (alive + 1); }
		e = find(e, classname, "monster_etank");
	}
	if (alive >= COUNTER_MAX_ALIVE) return;

	org = cf_find_origin();
	if (org == world) return;          // no deploy point in the map
	spot = org.origin;

	// A relay entity drops the wave's cars one every COUNTER_STAGGER seconds.
	relay = spawn();
	relay.classname = "cf_relay";
	setorigin(relay, spot);
	relay.cnt = COUNTER_CARS_PER_WAVE + cf_pressure_bonus();
	relay.think = cf_wave_relay;
	relay.nextthink = (time + 0.1);

	bprint("Davenport counter-attack deploying.\n");
};

// ---------------------------------------------------------------------
// forces_attack — ENEMY ground attack waves (mirror of the counterforces,
// but hostile). Periodically deploys HOSTILE tanks near a forces_attack_origin
// marker and sends them down the nearest ground path_corner route to hunt the
// player. Uses monster_etank ("main tank"); a light tank could be added to the
// random pick later if one exists. Tanks are T0 (enemy) — reticle red, they
// chase the player via FindTarget + the star gate. They use etank_die, which
// already drops loot, so killing them is rewarded.
// ---------------------------------------------------------------------
float FATK_TANKS_PER_WAVE = 2;     // tanks per wave
float FATK_STAGGER        = 3;     // seconds between tanks in a wave
float FATK_MAX_ALIVE      = 6;     // cap on concurrent attack tanks

void() monster_etank;        // etank.qc — the main battle tank (enemy)

// Marks one of OUR attack spawns so the cap counts only these (not editor
// monsters of the same class).
.float fatk_hostile;

// Spawn ONE hostile attack tank at `spot`, onto the nearest ground route.
void(vector spot) fatk_spawn_tank =
{
	local entity m;
	local entity osave;
	local entity corner;

	m = spawn();
	setorigin(m, spot);
	m.team = 0;                 // ENEMY faction (T0) — hostile to the player
	m.from_slot = 1;            // survive the day-start hand-placed purge
	m.fatk_hostile = 1;         // mark as one of ours (for the alive cap)

	// Build via the tank constructor (model/AI/turret/faction/etank_die).
	// As with the counterforces, set classname after building — runtime
	// spawns have no .map classname, which would break the alive-cap find().
	osave = self;
	self = m;
	monster_etank();
	m.classname = "monster_etank";
	self = osave;

	// Attach to the nearest ground route (path_corner chain advances on touch).
	corner = cf_find_nearest_corner(spot);
	if (corner != world)
	{
		m.target = corner.targetname;
		m.movetarget = corner;
		m.goalentity = corner;
	}

	// Rest on the ground (the marker may sit a bit above the surface).
	setorigin(m, spot);
	droptofloor();
};

// Nearest forces_attack_origin to the active objective (or map origin). world
// if none placed.
entity() fatk_find_origin =
{
	local entity e;
	local entity best;
	local float bestd;
	local float d;
	local vector ref;

	ref = '0 0 0';
	if ((g_objective_active != world)) { ref = g_objective_active.origin; }

	best = world;
	bestd = 0;
	e = find(world, classname, "forces_attack_origin");
	while (e)
	{
		d = vlen((e.origin - ref));
		if ((best == world) || (d < bestd)) { best = e; bestd = d; }
		e = find(e, classname, "forces_attack_origin");
	}
	return (best);
};

// Relay that drops the wave's tanks one FATK_STAGGER apart.
void() fatk_wave_relay =
{
	local vector spot;
	spot = self.origin;
	fatk_spawn_tank(spot);
	self.cnt = (self.cnt - 1);
	if (self.cnt > 0)
	{
		self.nextthink = (time + FATK_STAGGER);
		self.think = fatk_wave_relay;
	}
	else
	{
		remove(self);
	}
};

void() ForcesAttack_SpawnWave =
{
	local entity org;
	local entity relay;
	local entity e;
	local float alive;
	local vector spot;

	// Cap concurrent attack tanks.
	alive = 0;
	e = find(world, classname, "monster_etank");
	while (e)
	{
		if (e.fatk_hostile) { alive = (alive + 1); }
		e = find(e, classname, "monster_etank");
	}
	if (alive >= FATK_MAX_ALIVE) return;

	org = fatk_find_origin();
	if (org == world) return;          // no deploy point in the map
	spot = org.origin;

	relay = spawn();
	relay.classname = "fatk_relay";
	setorigin(relay, spot);
	relay.cnt = FATK_TANKS_PER_WAVE;
	relay.think = fatk_wave_relay;
	relay.nextthink = (time + 0.1);

	bprint("Enemy armour attacking.\n");
};
