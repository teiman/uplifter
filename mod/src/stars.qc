// stars.qc — Notoriety / wanted-level system (GTA-style 0..5).
//
// self.stars is a fractional float clamped to [0, 5]. The HUD displays
// floor(stars) as up to 5 GTA-style icons. Stars are awarded for hostile or
// suspicious actions and decay automatically with time — faster while flying
// in sigilo (low over the ground).
//
// All star changes go through Stars_Add / Stars_Set so we have a single
// place to clamp, message the player, etc.

float SIGILO_MAX_ALT       = 128;  // ≤128u over ground = sigilo (volar bajo)
float HIGH_FLIGHT_MIN_ALT  = 256;  // ≥256u over ground = "volar alto"
float HIGH_FLIGHT_TICK     = 10;   // +1 star every 10s while sustained
float HIGH_FLIGHT_CAP      = 4;    // high flight alone can't push past 4 stars
float STAR_DECAY_TICK      = 1.0;  // seconds between decay applications
float STAR_DECAY_NORMAL    = 0.05; // stars/sec lost in normal flight
float STAR_DECAY_SIGILO    = 0.25; // stars/sec lost while flying low
float STAR_SHOOT_COOLDOWN  = 0.5;  // min seconds between successive +stars from gunfire

void(float n) Stars_Set =
{
	if ((n < 0))
	{
		n = 0;
	}
	if ((n > 5))
	{
		n = 5;
	}
	self.stars = n;
};

void(float delta) Stars_Add =
{
	Stars_Set((self.stars + delta));
};

// Water-aware altitude over the surface directly below `e`. Returns the
// distance from e.origin_z down to whichever comes first: the BSP solid
// (terrain/structure) or the water plane at WATER_Z. Without the water
// check, a vehicle hovering just above the lake would measure altitude
// against the lake bed and read as "high" even at 1u over the surface.
//
// Cached per-entity per-frame. Several systems (sigilo, radar visibility,
// DANGER banner, high-flight star tick) hit this on the same entity in
// the same frame; the traceline + pointcontents is cheap individually
// but adds up.
float(entity e) Stars_EntAltOverGround =
{
	local float water_z;
	local float ground_z;
	local vector probe;

	if ((e.ground_alt_cache_time == time))
	{
		return (e.ground_alt_cache);
	}

	water_z = -8;  // mirrors WATER_Z in helo1.qc / mapWriter
	traceline(e.origin, (e.origin - '0 0 4096'), TRUE, e);
	ground_z = trace_endpos_z;

	// Water-aware: if there's water directly under e and e is above the
	// surface, the effective floor is the water plane (which the trace
	// passed through). Pointcontents at WATER_Z - 4 = the same probe
	// helo1.qc uses to detect "we're over the lake".
	if ((e.origin_z > water_z))
	{
		probe = e.origin;
		probe_z = (water_z - 4);
		if ((pointcontents(probe) == CONTENT_WATER))
		{
			if ((water_z > ground_z))
			{
				ground_z = water_z;
			}
		}
	}

	e.ground_alt_cache = (e.origin_z - ground_z);
	e.ground_alt_cache_time = time;
	return (e.ground_alt_cache);
};

// Altitude over the terrain directly below the player (or piloted vehicle).
float() Stars_AltOverGround =
{
	local entity ref;

	ref = self;
	if ((self.enemy.owner == self))
	{
		ref = self.enemy;
	}
	return (Stars_EntAltOverGround(ref));
};

float() Stars_InSigilo =
{
	if ((Stars_AltOverGround() <= SIGILO_MAX_ALT))
	{
		return (TRUE);
	}
	return (FALSE);
};

// Called once per PlayerPreThink. Applies decay at STAR_DECAY_TICK intervals.
void() Stars_DecayTick =
{
	local float rate;

	if ((self.stars <= 0))
	{
		return;
	}
	if ((time < self.star_decay_next))
	{
		return;
	}
	self.star_decay_next = (time + STAR_DECAY_TICK);
	if (Stars_InSigilo())
	{
		rate = STAR_DECAY_SIGILO;
	}
	else
	{
		rate = STAR_DECAY_NORMAL;
	}
	Stars_Add((0 - (rate * STAR_DECAY_TICK)));
};

// Called once per PlayerPreThink. While sustained high flight (>= HIGH_FLIGHT_MIN_ALT
// over ground) accumulates, ticks +1 star every HIGH_FLIGHT_TICK seconds — but
// can only push notoriety up to HIGH_FLIGHT_CAP (other actions can go further).
void() Stars_HighFlightTick =
{
	if ((Stars_AltOverGround() < HIGH_FLIGHT_MIN_ALT))
	{
		// Reset the timer so the player has to stay high for a full tick.
		self.star_highflight_next = (time + HIGH_FLIGHT_TICK);
		return;
	}
	if ((time < self.star_highflight_next))
	{
		return;
	}
	self.star_highflight_next = (time + HIGH_FLIGHT_TICK);
	if ((self.stars >= HIGH_FLIGHT_CAP))
	{
		return;
	}
	Stars_Add(1);
	sprint(self, "[notoriety] spotted flying high\n");
};

// Notoriety gating: returns TRUE iff the current monster (`self`) should
// engage `player` based on their star level, with stealth from low flight
// (sigilo) and distance taken into account.
//
// Policy (matches gameplay.md):
//   0★ → ignore.
//   1★ → ignore (verbal alarms only; not engagement).
//   2★ → helis only, and only when player is close (<500u).
//   3★ → helis & static AA always; mobile units only when close.
//   4★ → everyone, normal range.
//   5★ → everyone, extended range (no extra filter).
//
// Sigilo overrides: if the player is flying low and is farther than
// SIGILO_DETECT_RADIUS from this monster, the monster cannot detect them
// regardless of star level (except 5★, which sees through stealth).
float SIGILO_DETECT_RADIUS = 500;

float(entity player) Stars_EnemyShouldEngage =
{
	local float s;
	local float d;
	local entity pveh;
	local float low;

	s = floor(player.stars);

	// 5★: ignores stealth.
	if ((s >= 5))
	{
		return (TRUE);
	}

	// Figure out the active player entity for distance & altitude. If the
	// player is piloting a vehicle, use the vehicle's origin.
	pveh = player;
	if ((player.enemy.owner == player))
	{
		pveh = player.enemy;
	}
	d = vlen((pveh.origin - self.origin));

	// Stealth from low flight, applies at <5★.
	{
		local entity osave;
		osave = self;
		self = player;
		low = Stars_InSigilo();
		self = osave;
	}
	if ((low && (d > SIGILO_DETECT_RADIUS)))
	{
		return (FALSE);
	}

	if ((s <= 1))
	{
		return (FALSE);
	}

	if ((s == 2))
	{
		// Only helis engage, and only at close range.
		if ((self.classname != "monster_helo"))
		{
			return (FALSE);
		}
		if ((d > SIGILO_DETECT_RADIUS))
		{
			return (FALSE);
		}
		return (TRUE);
	}

	if ((s == 3))
	{
		// Helis and static AA always; everything else only when close.
		if ((self.classname == "monster_helo"))
		{
			return (TRUE);
		}
		if (((self.classname == "monster_sam") || (self.classname == "monster_aag") || (self.classname == "monster_amg") || (self.classname == "monster_rad")))
		{
			return (TRUE);
		}
		if ((d <= SIGILO_DETECT_RADIUS))
		{
			return (TRUE);
		}
		return (FALSE);
	}

	// 4★: everyone, normal range (FindTarget's own RANGE_FAR clamp still applies).
	return (TRUE);
};

// Called from inside every AC_* projectile spawner. If `self` is a hostile
// monster firing the projectile, mark it as a "war criminal" for the next
// WARCRIME_WINDOW seconds. The camera awards extra stars/credits when it
// photographs a target with warcrime_until > time.
float WARCRIME_WINDOW = 3.0;

void() Stars_FlagAttacker =
{
	if ((self.flags & FL_MONSTER))
	{
		self.warcrime_until = (time + WARCRIME_WINDOW);
	}
};

// Called from T_Damage when a hostile-vs-player-attacker pair lands a hit.
// Looks up self = the player owning the attack and bumps stars accordingly.
// Anti-spam: STAR_SHOOT_COOLDOWN gates successive ticks.
//   target_kind: 0 = enemy (monster), 1 = civilian/neutral.
void(float target_kind) Stars_OnPlayerDamagedTarget =
{
	if ((time < self.star_shoot_cooldown))
	{
		return;
	}
	self.star_shoot_cooldown = (time + STAR_SHOOT_COOLDOWN);
	if ((target_kind == 0))
	{
		Stars_Add(4);
	}
	else
	{
		Stars_Add(1);
	}
};
