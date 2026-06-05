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
float CIV_STAND_FRAME        = 17;    // player.mdl idle/stand frame
float CIV_SPAWN_STAGGER      = 0.25;  // seconds between pre-spawned civilians
float PICKUP_HANDOFF_QUIET   = 2.0;   // seconds the new pickup's smoke is hushed

// Civilian behaviour state.
float CIV_WAIT = 0;   // standing at the pickup, idle
float CIV_JUMP = 1;   // hopping in place (heli flying near)
float CIV_RUN  = 2;   // running toward a landed heli to board

// Per-player passenger count.
.float pax;
// On the info_pickup entity: next time it spawns a marker puff.
.float next_puff;
// Marker on info_pickup: which player it's actively spawning for.
.entity active_player;
// On a civilian: behaviour state (CIV_WAIT/JUMP/RUN) and next hop time.
.float civ_state;
.float civ_next_hop;
// On a civilian: the info_pickup it belongs to (so the pickup can track how
// many are still waiting and top them back up as they board).
.entity civ_pickup;
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

// Globals (entity-attached on `world`).
entity g_objective_active;
entity g_ship;

// Forward decls de los constructores de monstruos que usa slot_spawn_enemy.
// Sus definiciones reales están en aag.qc / sam.qc / rad.qc, que se
// compilan después de objectives.qc en progs.src.
void() monster_aag;
void() monster_sam;
void() monster_rad;

// Forward decl: defined below; pickup_think calls it to hand off to a fresh
// objective when its present batch is rescued but the day's quota remains.
void() rotate_objective;
// Forward decl: sets the persistent bottom mission line (defined below).
void() Mission_SetLine;
// Forward decl: one-shot "return to ship" announcement (defined below).
void() Objective_AnnounceReturn;

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
	// delivered, so it must be replaced or the deliver-quota could never be
	// met. Day_OnCivilianLost frees its field slot AND lets the pickups
	// create a replacement (it un-counts it from g_wave_spawned).
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

	// WAIT: idle at the pickup.
	self.civ_state = CIV_WAIT;
	self.frame = CIV_STAND_FRAME;
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
	// Feet sit at floorz; origin is centre, so add half-height (24) + 1u slack.
	org_z = (floorz + 25);
	setorigin(c, org);

	c.flags = (c.flags | FL_MONSTER | FL_ONGROUND);
	c.groundentity = trace_ent;

	c.health = 25;
	c.takedamage = DAMAGE_AIM;
	c.th_die = civilian_die;
	c.civ_pickup = pk;
	c.civ_state = CIV_WAIT;
	c.frame = CIV_STAND_FRAME;
	c.civ_next_hop = (time + random() * CIV_JUMP_INTERVAL);  // desync hops
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
		return;
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

	// Smoke beacon over the ship while DELIVER is active, same as the pickup
	// marker so the player can spot where to drop the survivors off. Tick fast
	// (0.1s) while puffing so the column is as dense as the pickup's; idle at
	// 0.25s otherwise.
	if (Deliver_IsActive())
	{
		self.nextthink = (time + PICKUP_PUFF_INTERVAL);
		ang = (random() * 360);
		rad = (random() * PICKUP_PUFF_RADIUS);
		makevectors(ang * '0 1 0');
		puffpos = self.origin + (v_forward * rad);
		puffpos_z = self.origin_z + 16 + (random() * PICKUP_PUFF_Z_RANGE);
		pickup_spawn_puff(puffpos);
	}
	else
	{
		self.nextthink = (time + 0.25);
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
						// THIS advances the day quota: passengers UNLOADED at
						// the ship (picking up in the field does not count).
						Day_OnDelivered(client.pax);
						client.pax = 0;
						client.stars = 0;
						sound(heli, CHAN_ITEM, "items/r_item2.wav", 1, ATTN_NORM);
						// Don't rotate the objective on deposit: handoff is
						// driven in pickup_think; rotating here would abandon
						// civilians still waiting.
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

	bprint("[uplifter] objectives v3: deliver-quota + grounded civilians\n");

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

	{
		local float more_to_rescue;

		// Civilians still to rescue this day: any alive in the field now, or
		// still to be created. (Same rule as the bottom mission line.)
		more_to_rescue = 0;
		if ((g_wave_left > 0)) { more_to_rescue = 1; }
		if ((g_wave_spawned < g_wave_quota)) { more_to_rescue = 1; }

		// Full heli, or nothing left to rescue while carrying pax → DELIVER.
		// Point at the ship so the compass guides the player home. This is
		// what was missing: once you've grabbed everyone the arrow must flip
		// to the ship instead of pointing at an empty pickup.
		if ((self.pax >= PICKUP_CAPACITY) || (!more_to_rescue && (self.pax > 0)))
		{
			target = g_ship;
			if (target != world) { kind = 1; }   // DELIVER → ship
			else                 { kind = 2; }   // pax but no ship placed
		}
		// Otherwise, if there are civilians to rescue, point at the pickup.
		else if (more_to_rescue && (g_objective_active != world))
		{
			target = g_objective_active;
			kind = 0;                              // PICKUP → active objective
		}
		// Carrying pax but (oddly) no active objective and not "done": still
		// send them to the ship rather than show nothing.
		else if (self.pax > 0)
		{
			target = g_ship;
			if (target != world) { kind = 1; }
			else                 { kind = 2; }
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

	// Mirror the current day number to the player for the CSQC "DAY n" badge.
	self.hud_day = g_day;

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
						// THIS advances the day quota: passengers UNLOADED at
						// the ship (picking up in the field does not count).
						Day_OnDelivered(client.pax);
						client.pax = 0;
						client.stars = 0;
						sound(heli, CHAN_ITEM, "items/r_item2.wav", 1, ATTN_NORM);
						// Don't rotate the objective on deposit: handoff is
						// driven in pickup_think; rotating here would abandon
						// civilians still waiting.
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
