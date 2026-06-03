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
	self.model = "progs/box1.mdl";
	setmodel(self, "progs/box1.mdl");
	setsize(self, '-16 -16 0', '16 16 32');
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
	sprint(player, "scrap +1 (");
	sprint(player, ftos(player.scrap));
	sprint(player, ")\n");

	// Hide and queue respawn.
	self.solid = SOLID_NOT;
	self.model = "";
	setmodel(self, "");
	self.think = scrap_respawn;
	self.nextthink = (time + SCRAP_RESPAWN_MIN + (random() * SCRAP_RESPAWN_VAR));
};

// Map entity: info_scrap.
void() info_scrap =
{
	precache_model("progs/box1.mdl");
	precache_sound("items/protect2.wav");
	precache_sound("items/itembk2.wav");
	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_NONE;
	setmodel(self, "progs/box1.mdl");
	setsize(self, '-16 -16 0', '16 16 32');
	self.touch = scrap_touch;
	self.classname = "info_scrap";
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
