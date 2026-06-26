// ebomb.qc — "bombing_launcher": an environmental hazard that shells a random
// area of the city. Every BOMB_BURST_PERIOD seconds it fires a burst of
// BOMB_BURST_COUNT rockets, one after another, each lobbed on a slow ballistic
// arc onto a random spot near a randomly-chosen info_pickup (so the shelling
// lands in relevant, playable parts of the city). The launcher itself is
// INDESTRUCTIBLE — pure ambient threat, no health, no AI targeting.
//
// The rockets are slow, high-arc lobs (MOVETYPE_TOSS lets Quake apply gravity;
// we compute the launch velocity for a fixed flight time so they land on the
// chosen point). They explode on contact (T_RadiusDamage + BecomeExplosion),
// reusing the standard projectile blast.

float BOMB_BURST_COUNT   = 10;    // rockets per burst
float BOMB_BURST_PERIOD  = 10;    // seconds between bursts
float BOMB_SHOT_STAGGER  = 0.45;  // seconds between rockets within a burst
// Flight time. To make the rockets 50% slower WITHOUT changing the arc shape,
// we double the flight time AND quarter the gravity: scaling time by k while
// keeping the same spatial path needs g scaled by 1/k^2 (k=2 → g/4). Result:
// identical parabola, traversed at half the speed.
float BOMB_FLIGHT_TIME   = 14.0;  // was 7.0 → doubled = half speed
// Simulated gravity (NOT sv_gravity). We fly the rocket with MOVETYPE_FLY and
// integrate this ourselves each tick, so the arc is fully under our control
// and independent of the server's gravity cvar.
float BOMB_GRAVITY       = 125;   // was 500 → /4, so the arc shape is unchanged
float BOMB_ARC_BOOST     = 1.0;   // 1.0 = plain parabola that lands on target
                                  // (slightly flattened — no extra height kick)
float BOMB_THINK_DT      = 0.05;  // integration step (20 Hz) for the arc
// Apogee ceiling: cap the launch's upward velocity so the arc's peak stays
// safely BELOW the sky (SKY_TOP_Z = 4096). Peak height ≈ vz^2 / (2*g); we cap
// vz so that peak ≤ BOMB_MAX_APEX above the muzzle.
float BOMB_MAX_APEX      = 2400;  // max arc height (u) above the launch point
float BOMB_SPREAD        = 256;   // random scatter (u) around the target point
float BOMB_DMG           = 90;    // blast damage per rocket (same as AC_rocket)
float BOMB_MUZZLE_UP     = 32;    // launch a touch above the launcher origin

// ---------------------------------------------------------------------
// Explosión de artillería — efecto de puffs propio (sustituye a TE_EXPLOSION)
// ---------------------------------------------------------------------
//
// Al impactar el cohete generamos:
//   · 4 puffs GRISES que salen en círculo (a 0/90/180/270°) con velocidad
//     horizontal hacia fuera → la nube de humo se expande por el suelo.
//   · 3 puffs de FUEGO (rojo/naranja/amarillo, colores fullbright) que
//     ASCIENDEN → la bola de fuego sube.
// Reutilizamos los sprites puff_g*.spr (humo) y puff_fire.spr (fuego, ver
// gen-firepuff-spr.js). Ambos se precargan en worldspawn.

float BOMB_FX_GREY_FRAME_DT = 0.12;  // s por frame del humo gris (x2 más lento)
float BOMB_FX_GREY_OUT_VEL  = 120;   // velocidad horizontal de expansión (u/s)
float BOMB_FX_FIRE_FRAME_DT = 0.14;  // s por frame del fuego (x2 más lento)
float BOMB_FX_FIRE_RISE_VZ  = 110;   // velocidad de ascenso del fuego (u/s)

// Avance de un puff gris: corre sus frames y se frena/expande hasta agotarse.
void() bomb_grey_puff_think =
{
	self.frame = (self.frame + 1);
	if ((self.frame >= 23))
	{
		remove(self);
		return;
	}
	// Va perdiendo empuje horizontal (la nube se asienta al expandirse).
	self.velocity_x = (self.velocity_x * 0.90);
	self.velocity_y = (self.velocity_y * 0.90);
	self.think = bomb_grey_puff_think;
	self.nextthink = (time + BOMB_FX_GREY_FRAME_DT);
};

// Avance de un puff de fuego: 5 frames (puff_fire.spr) y desaparece.
void() bomb_fire_puff_think =
{
	self.frame = (self.frame + 1);
	if ((self.frame >= 5))
	{
		remove(self);
		return;
	}
	// Sube acelerando un poco al principio, luego frena horizontalmente.
	self.velocity_x = (self.velocity_x * 0.92);
	self.velocity_y = (self.velocity_y * 0.92);
	self.think = bomb_fire_puff_think;
	self.nextthink = (time + BOMB_FX_FIRE_FRAME_DT);
};

// Dispara el efecto completo en `org` (el punto del impacto).
void(vector org) bomb_explosion_fx =
{
	local entity e;
	local float i;
	local float ang;
	local string mdl;

	// Destello/onda de la explosión del motor, además de los puffs custom.
	WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
	WriteByte(MSG_BROADCAST, TE_EXPLOSION);
	WriteCoord(MSG_BROADCAST, org_x);
	WriteCoord(MSG_BROADCAST, org_y);
	WriteCoord(MSG_BROADCAST, org_z);

	// --- 8 puffs grises en círculo, expandiéndose ---
	i = 0;
	while (i < 8)
	{
		e = spawn();
		// Variamos el sprite gris por puff (5 disponibles, en módulo) para que
		// la nube no salga clónica.
		if      (i == 0 || i == 5) { mdl = "progs/puff_g.spr"; }
		else if (i == 1 || i == 6) { mdl = "progs/puff_g2.spr"; }
		else if (i == 2 || i == 7) { mdl = "progs/puff_g3.spr"; }
		else if (i == 3)           { mdl = "progs/puff_g4.spr"; }
		else                       { mdl = "progs/puff_g5.spr"; }
		setmodel(e, mdl);
		setorigin(e, org);
		e.movetype = MOVETYPE_NOCLIP;
		e.solid = SOLID_NOT;
		e.classname = "bomb_grey_puff";
		e.frame = 0;
		// Dirección radial: 8 puffs cada 45° en el plano horizontal.
		ang = (i * 45);
		makevectors(ang * '0 1 0');
		e.velocity = (v_forward * BOMB_FX_GREY_OUT_VEL);
		e.velocity_z = (10 + (random() * 20));   // un leve hálito hacia arriba
		e.think = bomb_grey_puff_think;
		e.nextthink = (time + BOMB_FX_GREY_FRAME_DT);
		i = (i + 1);
	}

	// --- 3 puffs de fuego ascendentes (fullbright cálido) ---
	i = 0;
	while (i < 3)
	{
		e = spawn();
		setmodel(e, "progs/puff_fire.spr");
		// Pequeño escalonado vertical para que no salgan superpuestos.
		setorigin(e, org + ('0 0 1' * (i * 12)));
		e.movetype = MOVETYPE_NOCLIP;
		e.solid = SOLID_NOT;
		e.classname = "bomb_fire_puff";
		e.frame = 0;
		e.velocity_x = ((random() - 0.5) * 40);
		e.velocity_y = ((random() - 0.5) * 40);
		e.velocity_z = (BOMB_FX_FIRE_RISE_VZ + (random() * 40));
		e.think = bomb_fire_puff_think;
		// Escalonamos el arranque de la animación para dar profundidad.
		e.nextthink = (time + (i * 0.04) + BOMB_FX_FIRE_FRAME_DT);
		i = (i + 1);
	}
};

// ---------------------------------------------------------------------
// Diana de impacto en tierra
// ---------------------------------------------------------------------
//
// Al empezar una andanada colocamos un gran círculo rojo (target_ring.spr,
// SPR_ORIENTED → se tumba según .angles) sobre el suelo del silo, 4u por
// encima, mirando hacia arriba. Vive un tiempo fijo (bomb_burst_lifetime) que
// cubre desde el primer disparo hasta el impacto esperado del último misil,
// luego se borra solo (bomb_target_think). Más robusto que contar impactos.

float BOMB_TARGET_FLOAT_Z = 4;   // u por encima del suelo

// Vida de la diana: think que la mantiene visible hasta self.ltime (el momento
// en que se espera el impacto del ÚLTIMO misil de la andanada) y luego la
// borra. Es más robusto que contar impactos: un misil que choque pronto con un
// edificio no hace desaparecer la diana antes de tiempo.
void() bomb_target_think =
{
	if ((time >= self.ltime))
	{
		if ((self.owner.bomb_target == self)) { self.owner.bomb_target = world; }
		remove(self);
		return;
	}
	self.think = bomb_target_think;
	self.nextthink = (time + 0.2);
};

// Duración estimada de una andanada, desde que se planta la diana hasta que
// cae el último misil: tiempo en disparar los que faltan (cnt restante ×
// stagger) + el vuelo del último + un pequeño margen.
float() bomb_burst_lifetime =
{
	return ((BOMB_BURST_COUNT * BOMB_SHOT_STAGGER) + BOMB_FLIGHT_TIME + 1);
};

// Coloca la diana sobre el centro `at` de la andanada, enganchada al launcher.
void(entity launcher, vector at) bomb_spawn_target =
{
	local entity t;
	local vector ground;

	// Quita una diana previa si quedó alguna (andanada solapada).
	if ((launcher.bomb_target != world))
	{
		remove(launcher.bomb_target);
		launcher.bomb_target = world;
	}

	// Traza hacia abajo para apoyar la diana en el suelo real bajo el punto.
	traceline(at + '0 0 64', at - '0 0 4096', TRUE, launcher);
	ground = at;
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		ground = trace_endpos;
	}

	t = spawn();
	t.classname = "bomb_target";
	t.owner = launcher;
	t.movetype = MOVETYPE_NONE;
	t.solid = SOLID_NOT;
	setmodel(t, "progs/target_ring.spr");
	// SPR_ORIENTED (type 3): angles '90 0 0' lo deja plano sobre el suelo,
	// cara hacia arriba (orientación confirmada a ojo en ironwail).
	t.angles = '90 0 0';
	setorigin(t, ground + ('0 0 1' * BOMB_TARGET_FLOAT_Z));
	// Vive hasta que se espera el impacto del último misil de la andanada.
	t.ltime = (time + bomb_burst_lifetime());
	t.think = bomb_target_think;
	t.nextthink = (time + 0.2);
	launcher.bomb_target = t;
};

// Pick a random info_pickup (a "silo" objective) for the WHOLE burst to shell.
// Returns its world origin, or the launcher's own origin if the map has no
// pickups. The whole salvo targets this one spot (scatter is added per rocket
// in bomb_lob_rocket), so a burst saturates a single area instead of peppering
// random ones.
vector() bomb_pick_silo =
{
	local entity p;
	local entity chosen;
	local float n;
	local float pickn;

	// Count info_pickups, then pick the pickn-th one (two passes, simple).
	n = 0;
	p = find(world, classname, "info_pickup");
	while (p)
	{
		n = (n + 1);
		p = find(p, classname, "info_pickup");
	}

	chosen = world;
	if (n > 0)
	{
		pickn = floor(random() * n);
		if (pickn >= n) { pickn = (n - 1); }
		n = 0;
		p = find(world, classname, "info_pickup");
		while (p)
		{
			if (n == pickn) { chosen = p; }
			n = (n + 1);
			p = find(p, classname, "info_pickup");
		}
	}

	if (chosen != world)
		return (chosen.origin);
	return (self.origin);   // no pickups: shell around ourselves
};

// A lobbed rocket hit something → blast. Same outcome as ACprojectile_touchboom
// but self-contained (no owner/enemy bookkeeping; the launcher is faceless).
void() bomb_rocket_touch =
{
	if ((other.solid == SOLID_TRIGGER))
	{
		return;   // pass through triggers (pickups, etc.)
	}
	if ((pointcontents(self.origin) == CONTENT_SKY))
	{
		remove(self);
		return;
	}
	if ((other.health > 0))
	{
		T_Damage(other, self, self.owner, BOMB_DMG);
	}
	T_RadiusDamage(self, self.owner, BOMB_DMG, other);
	// Nudge back along travel so the explosion sprite isn't buried in the wall.
	self.origin = (self.origin - (8 * normalize(self.velocity)));
	// Efecto propio (8 puffs grises en círculo + 3 de fuego ascendentes) en
	// lugar de la TE_EXPLOSION del motor.
	bomb_explosion_fx(self.origin);
	remove(self);
};

// Safety despawn: if a rocket somehow never lands (flew off-map), kill it after
// a generous lifetime so they can't accumulate.
void() bomb_rocket_expire =
{
	bomb_explosion_fx(self.origin);
	remove(self);
};

// Square root (this fteqcc has no builtin sqrt). Newton's method, seeded from
// a halving so it converges fast for the magnitudes we use.
float(float x) bomb_sqrt =
{
	local float r;
	local float i;
	if (x <= 0) { return 0; }
	r = x;
	if (r > 1) { r = (x * 0.5); }
	i = 0;
	while (i < 8)
	{
		r = ((r + (x / r)) * 0.5);
		i = (i + 1);
	}
	return r;
};

// Per-tick arc integration. The rocket flies with MOVETYPE_FLY (constant
// velocity, no engine gravity), and HERE we subtract our own simulated gravity
// from the vertical velocity each step — so the path is a parabola we fully
// control. We also re-point the model along its current velocity and expire it
// after its lifetime so stray rockets can't pile up.
void() bomb_rocket_fly =
{
	// Apply simulated gravity to the vertical velocity.
	self.velocity_z = (self.velocity_z - (BOMB_GRAVITY * BOMB_THINK_DT));
	// Point the rocket where it's heading (nose-down as it falls).
	self.angles = vectoangles(self.velocity);

	// Lifetime guard: blow up if it's been flying too long (never landed).
	if (time >= self.attack_finished)
	{
		bomb_rocket_expire();
		return;
	}
	self.think = bomb_rocket_fly;
	self.nextthink = (time + BOMB_THINK_DT);
};

// Lob ONE rocket from `org` so it arcs onto `dest` over ~BOMB_FLIGHT_TIME, on a
// NORMAL (slightly flat) parabola using SIMULATED gravity (MOVETYPE_FLY + our
// own integration in bomb_rocket_fly), independent of sv_gravity. For flight
// time T and our gravity g:
//   horizontal: v = (dest - org) / T            (XY, constant)
//   vertical:   vz = (dest_z - org_z)/T + 0.5*g*T   → lands exactly on dest.
// We then CLAMP vz so the arc's apogee (vz^2 / 2g) stays under BOMB_MAX_APEX,
// keeping the peak well below the sky ceiling. The clamp only bites on very
// long shots; near targets keep their natural (lower) arc.
void(entity launcher, vector org, vector dest) bomb_lob_rocket =
{
	local entity m;
	local float g;
	local float T;
	local float vzMax;
	local vector vel;

	g = BOMB_GRAVITY;
	T = BOMB_FLIGHT_TIME;

	m = spawn();
	m.owner = launcher;
	m.classname = "bomb_rocket";
	m.movetype = MOVETYPE_FLY;          // constant velocity; we add gravity ourselves
	m.solid = SOLID_BBOX;
	m.effects = EF_DIMLIGHT;
	setmodel(m, "progs/rocket1.mdl");
	setsize(m, '0 0 0', '0 0 0');
	setorigin(m, org);

	vel_x = ((dest_x - org_x) / T);
	vel_y = ((dest_y - org_y) / T);
	vel_z = ((((dest_z - org_z) / T) + (0.5 * g * T)) * BOMB_ARC_BOOST);
	// Cap the upward velocity so the apogee stays below the sky. Peak height is
	// vz^2/(2g); solve vzMax = sqrt(2*g*BOMB_MAX_APEX).
	vzMax = bomb_sqrt(2 * g * BOMB_MAX_APEX);
	if (vel_z > vzMax) { vel_z = vzMax; }
	m.velocity = vel;
	m.angles = vectoangles(m.velocity);

	m.touch = bomb_rocket_touch;
	m.attack_finished = (time + BOMB_FLIGHT_TIME + 4);   // lifetime (arc + slack)
	m.think = bomb_rocket_fly;
	m.nextthink = (time + BOMB_THINK_DT);

	sound(launcher, CHAN_WEAPON, "weapons/sgun1.wav", 1, ATTN_NORM);
};

// Fire the next rocket in the current burst, then either schedule the next
// rocket (stagger) or, when the burst is spent, wait BOMB_BURST_PERIOD for the
// next burst. self.cnt counts rockets remaining in this burst; self.movedir
// holds the silo (pickup) this WHOLE burst is shelling.
void() bomb_launcher_think =
{
	local vector org;
	local vector dest;

	// At the START of a burst (counter full), pick ONE silo for the whole
	// salvo so all 10 rockets saturate the same area, y planta la diana de
	// impacto sobre ese punto (se borra cuando impacta el último misil).
	if ((self.cnt >= BOMB_BURST_COUNT))
	{
		self.movedir = bomb_pick_silo();
		bomb_spawn_target(self, self.movedir);
	}

	org = (self.origin + ('0 0 1' * BOMB_MUZZLE_UP));
	// Aim at the burst's silo, scattered within BOMB_SPREAD so the salvo peppers
	// the area around it rather than stacking on one exact point.
	dest = self.movedir;
	dest_x = (dest_x + ((random() - 0.5) * 2 * BOMB_SPREAD));
	dest_y = (dest_y + ((random() - 0.5) * 2 * BOMB_SPREAD));
	bomb_lob_rocket(self, org, dest);

	self.cnt = (self.cnt - 1);
	if (self.cnt > 0)
	{
		// More rockets in this burst → fire the next shortly.
		self.nextthink = (time + BOMB_SHOT_STAGGER);
	}
	else
	{
		// Burst done → reload the counter and wait for the next burst.
		self.cnt = BOMB_BURST_COUNT;
		self.nextthink = (time + BOMB_BURST_PERIOD);
	}
	self.think = bomb_launcher_think;
};

// bombing_launcher — placed by the editor. Indestructible ambient hazard:
// stationary, non-damageable, fires bursts at the city forever.
void() bombing_launcher =
{
	precache_model("progs/rocket1.mdl");
	precache_model("progs/s_explod.spr");
	precache_model("progs/target_ring.spr");   // diana de impacto de la andanada
	precache_sound("weapons/sgun1.wav");

	self.solid = SOLID_NOT;            // indestructible: not a damageable target
	self.movetype = MOVETYPE_NONE;
	self.takedamage = DAMAGE_NO;
	self.classname = "bombing_launcher";
	if (!self.netname) { self.netname = "Bombing Launcher"; }

	// Settle on the ground so muzzle/origin sit at surface level (the editor
	// drops markers ~64u high; MOVETYPE_NONE won't fall).
	traceline(self.origin + '0 0 64', self.origin - '0 0 2048', TRUE, self);
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		setorigin(self, trace_endpos);
	}

	// First burst after a short, randomised delay so multiple launchers don't
	// all fire in lockstep.
	self.cnt = BOMB_BURST_COUNT;
	self.think = bomb_launcher_think;
	self.nextthink = (time + 1 + (random() * BOMB_BURST_PERIOD));
};
