// scrap.qc — Scrap inventory and passive healing.
//
// Scrap pieces are placed by the map editor as `info_scrap` entities. Each
// piece sits idle until the player's vehicle touches it; on contact:
//   - plays a pickup sound,
//   - increments self.scrap by 1,
//   - disappears for SCRAP_RESPAWN_MIN + random(SCRAP_RESPAWN_VAR) seconds.
//
// While the player has scrap AND hasn't taken damage in the last
// SCRAP_HEAL_GRACE seconds, HP regenerates at SCRAP_HEAL_RATE per second,
// consuming 1 scrap per heal tick. When scrap hits 0, healing stops.
//
// On death the inventory is set to SCRAP_RESPAWN_COUNT (10) so the player
// always has a small buffer to recover with after a wipe.

float SCRAP_HEAL_RATE       = 4;     // HP per heal tick
float SCRAP_HEAL_TICK       = 1.0;   // seconds between heal applications
float SCRAP_HEAL_GRACE      = 4.0;   // seconds since last damage required to heal
float SCRAP_RESPAWN_MIN     = 120;   // base respawn delay
float SCRAP_RESPAWN_VAR     = 60;    // additional random delay (0..VAR)
float SCRAP_RESPAWN_COUNT   = 10;    // scrap given back after a death

void() scrap_respawn =
{
	self.solid = SOLID_TRIGGER;
	self.model = "progs/scrap.mdl";
	setmodel(self, "progs/scrap.mdl");
	setsize(self, '-12 -12 -12', '12 12 12');
	sound(self, CHAN_VOICE, "items/itembk2.wav", 1, ATTN_NORM);
};

void() scrap_touch =
{
	local entity player;

	// `other` may be the player on foot or the vehicle they pilot. Credit
	// the underlying player either way.
	player = other;
	if ((other.owner.classname == "player"))
	{
		player = other.owner;
	}
	if ((player.classname != "player"))
	{
		return;
	}
	if ((player.health < 1))
	{
		return;
	}

	player.scrap = (player.scrap + 1);
	sound(player, CHAN_ITEM, "items/protect2.wav", 1, ATTN_NORM);

	// Hide and queue respawn.
	self.solid = SOLID_NOT;
	self.model = "";
	setmodel(self, "");
	self.think = scrap_respawn;
	self.nextthink = (time + SCRAP_RESPAWN_MIN + (random() * SCRAP_RESPAWN_VAR));
};

// Drop an entity straight down onto the ground (the editor places markers a
// bit above terrain). Trace far down and snap origin so it rests on the
// surface instead of floating. Works for non-solid decoration too.
void(entity e, float foot) scrap_drop_to_ground =
{
	traceline(e.origin + '0 0 64', e.origin - '0 0 4096', TRUE, e);
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		setorigin(e, trace_endpos + [0, 0, foot]);
	}
};

// Spawn one scrap FRAGMENT ("pedrolo") clustered tightly around the pile
// centre, settled on the ground. Small radius so the chunks pile up touching
// each other rather than scattering.
void(entity pile) scrap_fragment =
{
	local entity d;
	local float a;
	local float r;

	d = spawn();
	d.classname = "scrap_decor";
	d.owner = pile;
	d.solid = SOLID_NOT;
	d.movetype = MOVETYPE_NONE;
	setmodel(d, "progs/scrap.mdl");
	a = (random() * 360);
	r = (random() * 14);                     // tight cluster: chunks touch
	makevectors(a * '0 1 0');
	setorigin(d, pile.origin + (v_forward * r));
	d.angles_y = (random() * 360);
	scrap_drop_to_ground(d, 4);
};

// Spawn one rebar "spike" that RADIATES from the shared centre point: all
// spikes start at the same spot (a broken-concrete clump) and fan outward at
// different yaws, tilted up out of the ground. `ang` is the fan yaw, `tilt`
// the pitch up from horizontal. Uses scrap.mdl (rusty grey-brown junk
// material) — the engine here can't tint models (colormod isn't applied), so
// we reuse the scrap material instead of the bright bullet model.
void(entity pile, vector base, float ang, float tilt) scrap_spike =
{
	local entity d;

	d = spawn();
	d.classname = "scrap_decor";
	d.owner = pile;
	d.solid = SOLID_NOT;
	d.movetype = MOVETYPE_NONE;
	setmodel(d, "progs/scrap.mdl");
	setorigin(d, base);                      // all spikes share this origin
	// Lay it out as a rod pointing along `ang` yaw, tilted up by `tilt`.
	d.angles_x = (0 - tilt);                 // pitch up
	d.angles_y = ang;
	d.angles_z = 90;                         // roll onto its side → reads as a rod
};

// Map entity: info_scrap — a pile of scrap. One pickup trigger sits on the
// ground; clustered scrap fragments pile around it; a few rebar spikes
// radiate from a shared point in the centre (like rods sticking out of a
// broken-concrete lump).
void() info_scrap =
{
	local float n;
	local float total;
	local vector hub;

	precache_model("progs/scrap.mdl");
	precache_sound("items/protect2.wav");
	precache_sound("items/itembk2.wav");

	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_NONE;
	setmodel(self, "progs/scrap.mdl");
	setsize(self, '-16 -16 -16', '16 16 16');
	self.touch = scrap_touch;
	self.classname = "info_scrap";
	// Sit the pickup piece on the ground (was floating at the editor's Z).
	scrap_drop_to_ground(self, 8);

	// Pile of fragments hugging the centre.
	n = 3 + floor(random() * 2);             // 3..4 chunks, tightly clustered
	while (n > 0)
	{
		scrap_fragment(self);
		n = n - 1;
	}

	// Rebar spikes: all radiate from a single hub point just above the
	// ground at the pile centre, fanned around in yaw.
	hub = self.origin + '0 0 6';
	total = 3 + floor(random() * 2);         // 3..4 spikes
	n = 0;
	while (n < total)
	{
		scrap_spike(self, hub,
			(n * (360 / total)) + (random() * 25),   // evenly fanned + jitter
			35 + (random() * 30));                   // tilt 35..65° up
		n = n + 1;
	}
};

// Called once per PlayerPreThink. While the player has scrap AND hasn't been
// damaged recently, ticks healing at SCRAP_HEAL_TICK intervals; consumes 1
// scrap per tick.
//
// While piloting a vehicle, helo1.qc/plane.qc overwrite player.health each
// tick from the vehicle's health — so we have to heal the vehicle, not the
// player, for the buff to be visible.
void() Scrap_HealTick =
{
	local entity tgt;

	if ((self.health < 1))
	{
		return;
	}
	if ((self.scrap < 1))
	{
		return;
	}
	if ((time < (self.pain_finished + SCRAP_HEAL_GRACE - 0.5)))
	{
		return;
	}
	if ((time < self.scrap_heal_next))
	{
		return;
	}

	tgt = self;
	if ((self.enemy.owner == self))
	{
		tgt = self.enemy;
	}
	if ((tgt.max_health <= 0))
	{
		return;
	}
	// No reparar si está demasiado dañado: por debajo del 10% de su vida máxima
	// el scrap ya no basta para recuperar el vehículo (hay que llegar al
	// hospital). Evita "auto-resucitarse" desde casi destruido.
	if ((tgt.health < (tgt.max_health * 0.1)))
	{
		return;
	}
	if ((tgt.health >= tgt.max_health))
	{
		return;
	}

	self.scrap_heal_next = (time + SCRAP_HEAL_TICK);
	self.scrap = (self.scrap - 1);
	tgt.health = (tgt.health + SCRAP_HEAL_RATE);
	if ((tgt.health > tgt.max_health))
	{
		tgt.health = tgt.max_health;
	}
};

// Called by PutClientInServer when the player (re)spawns. Resets scrap to
// the safety net SCRAP_RESPAWN_COUNT so the player always has a bit of
// recovery available — important since on death we lose passengers and
// star progress as well.
void() Scrap_OnRespawn =
{
	self.scrap = SCRAP_RESPAWN_COUNT;
};
