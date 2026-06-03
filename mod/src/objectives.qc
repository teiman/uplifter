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
float PICKUP_SPAWN_RADIUS    = 96;    // civilians spawn within this ring
float PICKUP_SPAWN_INTERVAL  = 1.5;   // seconds between civilian spawns
float SHIP_ACTIVE_RADIUS     = 256;
float SHIP_DEPOSIT_CREDITS   = 250;   // credits per delivered passenger
float CIV_WALK_SPEED         = 120;   // units/s
float CIV_BOARD_DIST         = 96;    // generous board radius (heli is 32u wide)
float CIV_THINK_INTERVAL     = 0.1;   // 10 Hz so velocity/yaw stay responsive
float CIV_SPAWN_NEAR_HELI    = 160;   // spawn this far from heli on landing

// Per-player passenger count.
.float pax;
// On the info_pickup entity: next time it spawns a civilian.
.float next_civilian;
// On the info_pickup entity: next time it spawns a marker puff.
.float next_puff;
// Marker on info_pickup: which player it's actively spawning for.
.entity active_player;

// Globals (entity-attached on `world`).
entity g_objective_active;
entity g_ship;

// Forward decls de los constructores de monstruos que usa slot_spawn_enemy.
// Sus definiciones reales están en aag.qc / sam.qc / rad.qc, que se
// compilan después de objectives.qc en progs.src.
void() monster_aag;
void() monster_sam;
void() monster_rad;

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

void() civilian_die =
{
	remove(self);
};

void() civilian_think =
{
	local vector dir;
	local float dist;
	local float yaw;
	local entity heli;

	heli = self.goalentity;
	if ((heli == world) || (heli.health < 1) || !heli.landed)
	{
		self.think = civilian_die;
		self.nextthink = (time + 0.1);
		return;
	}

	dir = (heli.origin - self.origin);
	dir_z = 0;
	dist = vlen(dir);

	if ((dist <= CIV_BOARD_DIST))
	{
		if ((heli.owner.pax < PICKUP_CAPACITY))
		{
			heli.owner.pax = (heli.owner.pax + 1);
			sound(heli, CHAN_ITEM, "items/r_item1.wav", 1, ATTN_NORM);
		}
		remove(self);
		return;
	}

	// MOVETYPE_STEP doesn't auto-step on terrain via velocity alone, so
	// drive locomotion with walkmove(): it tries the move and slides over
	// small obstacles like the engine handles for monsters.
	yaw = vectoyaw(dir);
	self.angles_y = yaw;
	self.ideal_yaw = yaw;
	walkmove(yaw, (CIV_WALK_SPEED * CIV_THINK_INTERVAL));

	// Animate using player.mdl run cycle (frames 0..6).
	self.walkframe = (self.walkframe + 1);
	if ((self.walkframe > 6))
	{
		self.walkframe = 0;
	}
	self.frame = self.walkframe;

	self.think = civilian_think;
	self.nextthink = (time + CIV_THINK_INTERVAL);
};

// Spawn a civilian at `org`, set to walk toward `heli` (which the player
// is currently piloting). `org.z` is a hint height — we drop the civilian
// down to the actual floor with droptofloor() (the engine's canonical way
// to settle a stepping monster on terrain) and mark FL_ONGROUND so the
// first walkmove() succeeds.
void(vector org, entity heli) spawn_civilian =
{
	local entity c;
	local vector start;

	c = spawn();
	c.classname = "civilian";
	c.solid = SOLID_SLIDEBOX;
	c.movetype = MOVETYPE_STEP;
	setmodel(c, "progs/player.mdl");
	setsize(c, '-12 -12 -24', '12 12 24');
	Day_OnCivilianSpawned();

	// Start a bit above the hint origin so droptofloor() has room to fall.
	start = org;
	start_z = (org_z + 64);
	setorigin(c, start);

	// Canonical walkmonster setup (see monsters.qc:walkmonster_start_go):
	// nudge up 1u, droptofloor, then mark FL_MONSTER so walkmove()
	// accepts this entity for locomotion. Without FL_MONSTER walkmove
	// returns false and the civilian stays frozen in place.
	{
		local entity oself;
		oself = self;
		self = c;
		self.origin_z = self.origin_z + 1;
		droptofloor();
		self = oself;
	}
	c.flags = (c.flags | FL_MONSTER | FL_ONGROUND);

	c.health = 25;
	c.takedamage = DAMAGE_AIM;
	c.th_die = civilian_die;
	c.goalentity = heli;
	c.think = civilian_think;
	c.nextthink = (time + 0.1);
};

// ---------------------------------------------------------------------
// info_pickup
// ---------------------------------------------------------------------

// Per-tick logic on the pickup: emit marker puffs while we're the active
// objective, and spawn civilians when a player lands within range.
void() pickup_think =
{
	local entity client;
	local entity heli;
	local vector spawnpos;
	local vector puffpos;
	local float ang;
	local float rad;

	self.nextthink = (time + 0.1);
	self.think = pickup_think;

	if ((self != g_objective_active))
	{
		return;
	}

	// Marker puffs: smoke beacon over the pickup. Spawns at random heights
	// so the column looks volumetric instead of a single rising rope.
	if ((time >= self.next_puff))
	{
		self.next_puff = (time + PICKUP_PUFF_INTERVAL);
		ang = (random() * 360);
		rad = (random() * PICKUP_PUFF_RADIUS);
		makevectors(ang * '0 1 0');
		puffpos = self.origin + (v_forward * rad);
		puffpos_z = self.origin_z + 16 + (random() * PICKUP_PUFF_Z_RANGE);
		pickup_spawn_puff(puffpos);
	}

	// Find a piloting player landed within range.
	client = find(world, classname, "player");
	while (client != world)
	{
		heli = client.enemy;
		if ((heli != world) && (heli.owner == client) && heli.landed)
		{
			if ((vlen((heli.origin - self.origin)) <= PICKUP_ACTIVE_RADIUS))
			{
				break;
			}
		}
		client = find(client, classname, "player");
	}

	if ((client == world))
	{
		return;
	}

	if ((client.pax >= PICKUP_CAPACITY))
	{
		return;
	}

	// Inicializa la cuota del día para este pickup si aún no la tiene.
	// pickup_quota_day se setea al valor de Day_WavePerPickup() la
	// primera vez que el pickup se activa este día; se resetea al cambiar
	// de día (Objectives_RotateDay).
	if ((self.pickup_quota_day <= 0))
	{
		self.pickup_quota_day = Day_WavePerPickup();
	}

	if ((self.pickup_spawned_day >= self.pickup_quota_day))
	{
		// Ya completó su cuota para este día.
		return;
	}

	if ((time < self.next_civilian))
	{
		return;
	}
	self.next_civilian = (time + PICKUP_SPAWN_INTERVAL);
	self.pickup_spawned_day = (self.pickup_spawned_day + 1);

	// Spawn the civilian close to the heli (not on the pickup ring) so
	// the trip is short and predictable — they appear on a ring around
	// the landed heli and run straight in.
	ang = (random() * 360);
	rad = CIV_SPAWN_NEAR_HELI;
	makevectors(ang * '0 1 0');
	spawnpos = heli.origin + (v_forward * rad);
	// Hint Z; spawn_civilian traces down from this height to find ground.
	spawnpos_z = heli.origin_z + 8;
	spawn_civilian(spawnpos, heli);
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

	// Fall to the ground: the editor leaves the marker 64u above terrain;
	// MOVETYPE_TOSS + a bbox lets the engine settle it on the surface so
	// the puff column rises from ground level.
	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_TOSS;
	setsize(self, '-8 -8 -8', '8 8 8');
	self.classname = "info_pickup";
	self.model = "";
	setmodel(self, "");
	self.think = pickup_think;
	self.nextthink = (time + 1);
};

// ---------------------------------------------------------------------
// info_ship
// ---------------------------------------------------------------------

void() rotate_objective;

// Touched by anything inside its radius — we react only to a landed heli
// piloted by a player with at least 1 passenger.
void() ship_check =
{
	local entity client;
	local entity heli;
	local float earned;

	self.nextthink = (time + 0.25);
	self.think = ship_check;

	client = find(world, classname, "player");
	while (client != world)
	{
		heli = client.enemy;
		if ((heli != world) && (heli.owner == client) && heli.landed)
		{
			if ((vlen((heli.origin - self.origin)) <= SHIP_ACTIVE_RADIUS))
			{
				if (client.pax > 0)
				{
					// hosp_cap == 0 → no inicializado (mapa antiguo); usa
					// el sistema viejo de SHIP_DEPOSIT_CREDITS.
					if ((self.hosp_cap > 0))
					{
						earned = Hospital_Receive(self, client.pax);
					}
					else
					{
						earned = (client.pax * SHIP_DEPOSIT_CREDITS);
					}
					if ((earned > 0))
					{
						client.credits = (client.credits + earned);
						sprint(client, "delivered ");
						sprint(client, ftos(client.pax));
						sprint(client, " pax (+$");
						sprint(client, ftos(earned));
						sprint(client, ")\n");
						client.pax = 0;
						client.stars = 0;
						sound(heli, CHAN_ITEM, "items/r_item2.wav", 1, ATTN_NORM);
						rotate_objective();
					}
					else
					{
						sprint(client, "hospital lleno o destruido — busca otro\n");
					}
				}
			}
		}
		client = find(client, classname, "player");
	}
};

void() info_ship =
{
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
	self.think = ship_check;
	self.nextthink = (time + 1);
};

// ---------------------------------------------------------------------
// Active-objective rotation
// ---------------------------------------------------------------------

// Count info_pickup entities, pick one different from the current active.
void() rotate_objective =
{
	local entity p;
	local entity pick;
	local float n;
	local float r;

	// Count candidates.
	n = 0;
	p = find(world, classname, "info_pickup");
	while (p != world)
	{
		n = (n + 1);
		p = find(p, classname, "info_pickup");
	}
	if ((n <= 0))
	{
		g_objective_active = world;
		return;
	}

	r = floor(random() * n);
	if ((r >= n))
	{
		r = (n - 1);
	}
	p = find(world, classname, "info_pickup");
	pick = p;
	while ((r > 0) && (p != world))
	{
		p = find(p, classname, "info_pickup");
		if (p != world)
		{
			pick = p;
		}
		r = (r - 1);
	}
	g_objective_active = pick;
	bprint("new objective active\n");
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

	bprint("[objectives] info_pickup count: ");
	bprint(ftos(n_pickup));
	bprint(" / info_ship count: ");
	bprint(ftos(n_ship));
	bprint("\n");
	if (n_pickup == 0)
	{
		bprint("[objectives] WARNING: no info_pickup in map\n");
	}
	if (n_ship == 0)
	{
		bprint("[objectives] WARNING: no info_ship in map — DELIVER mission won't work\n");
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

	if ((self.pax >= PICKUP_CAPACITY))
	{
		// Always switch to deliver mode when full, even if the map lacks
		// info_ship. Use kind=2 ("no ship placed") as a distinct signal
		// to the HUD so the player sees the change.
		target = g_ship;
		if (target != world)
		{
			kind = 1;
		}
		else
		{
			kind = 2;
		}
	}
	else if (self.pax > 0)
	{
		if (g_objective_active != world)
		{
			target = g_objective_active;
			kind = 0;
		}
		else
		{
			target = g_ship;
			if (target != world)
			{
				kind = 1;
			}
			else
			{
				kind = 2;
			}
		}
	}
	else if (g_objective_active != world)
	{
		target = g_objective_active;
		kind = 0;
	}

	if (target == world)
	{
		// Either nothing placed (kind stays -1) or pax-full with no ship
		// (kind=2). In both cases obj_dist/dotfwd are meaningless.
		self.obj_kind = kind;
		self.obj_dist = 0;
		self.obj_dotfwd = 0;
		self.obj_dotrgt = 0;
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
};

// Called once per PlayerPreThink. Computes the DANGER banner state for
// the CSQC HUD:
//   0  → hidden  (target below stealth altitude, ≤128u above ground)
//   1  → white   (above stealth altitude, no radar lock)
//   2  → red     (above stealth altitude AND a radar has lock)
// Stealth altitude matches the rule in rad.qc (RadFindTarget + rad_stand):
// 128u (≈2 pips at HEIGHT_UNIT=64) over the surface directly below.
// We measure from the piloted vehicle if any, otherwise from the player.
void() Stealth_HudTick =
{
	if ((Stars_AltOverGround() <= SIGILO_MAX_ALT))
	{
		self.hud_danger = 0;
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

// Reutiliza la lógica de ship_check (idéntica) y además libera plazas con
// el ritmo del hospital. ship_check reasigna self.think a sí misma; el
// release de plazas lo metemos en este wrapper que vuelve a programar.
void() hospital_check_and_release =
{
	local entity client;
	local entity heli;
	local float earned;

	self.nextthink = (time + 0.25);
	self.think = hospital_check_and_release;

	// Release de plazas (sólo si no destruido).
	if (!self.hosp_destroyed)
	{
		if ((time >= self.hosp_next_release))
		{
			if ((self.hosp_pax > 0))
			{
				self.hosp_pax = (self.hosp_pax - 1);
			}
			self.hosp_next_release = (time + self.hosp_rate);
		}
	}

	// Detección de heli aterrizado (inline desde ship_check).
	client = find(world, classname, "player");
	while (client != world)
	{
		heli = client.enemy;
		if ((heli != world) && (heli.owner == client) && heli.landed)
		{
			if ((vlen((heli.origin - self.origin)) <= SHIP_ACTIVE_RADIUS))
			{
				if (client.pax > 0)
				{
					earned = Hospital_Receive(self, client.pax);
					if ((earned > 0))
					{
						client.credits = (client.credits + earned);
						sprint(client, "delivered ");
						sprint(client, ftos(client.pax));
						sprint(client, " pax (+$");
						sprint(client, ftos(earned));
						sprint(client, ")\n");
						client.pax = 0;
						client.stars = 0;
						sound(heli, CHAN_ITEM, "items/r_item2.wav", 1, ATTN_NORM);
						rotate_objective();
					}
					else
					{
						sprint(client, "hospital lleno o destruido — busca otro\n");
					}
				}
			}
		}
		client = find(client, classname, "player");
	}
};

void() info_hospital =
{
	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_TOSS;
	setsize(self, '-8 -8 -8', '8 8 8');
	self.classname = "info_hospital";
	self.model = "";
	setmodel(self, "");
	Hospital_Init(self, 1);
	self.think = hospital_check_and_release;
	self.nextthink = (time + 1);
};

// ---------------------------------------------------------------------
// info_carrier  (portaaviones de USA, día 5)
// ---------------------------------------------------------------------
//
// Aterrizar dentro de SHIP_ACTIVE_RADIUS con el representante a bordo
// (.has_rep == 1) gana el juego.

.float has_rep;

void() carrier_check =
{
	local entity client;
	local entity heli;

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
					client.has_rep = 0;
					bprint("=== Representative delivered. Davenport speaks. ===\n");
					sound(heli, CHAN_ITEM, "items/r_item2.wav", 1, ATTN_NORM);
					// Trigger end of game.
					gameover = 1;
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

void() rep_touch =
{
	if ((other.classname != "player"))
	{
		return;
	}
	other.has_rep = 1;
	sprint(other, "Representative on board. Head to the carrier.\n");
	sound(other, CHAN_ITEM, "items/r_item1.wav", 1, ATTN_NORM);
	remove(self);
};

void() info_representative =
{
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
// Day rotation hook (called from day.qc when wave advances)
// ---------------------------------------------------------------------

void() Objectives_RotateDay =
{
	local entity rep;
	local entity p;

	// Reset de la cuota diaria de cada pickup. Cada uno empezará el día
	// nuevo con su propia cuenta y volverá a spawnear hasta Day_WavePerPickup.
	p = find(world, classname, "info_pickup");
	while (p)
	{
		p.pickup_spawned_day = 0;
		p.pickup_quota_day = 0;   // será re-inicializada lazy en pickup_think
		p = find(p, classname, "info_pickup");
	}

	if ((g_day == 5))
	{
		// Activate the representative pickup if present in the map.
		rep = find(world, classname, "info_representative");
		if (rep != world)
		{
			setmodel(rep, "progs/player.mdl");
			bprint("The representative awaits at the marked location.\n");
		}
		else
		{
			bprint("[objectives] WARNING: day 5 reached but no info_representative in map\n");
		}
		return;
	}
	rotate_objective();
};
