// Swarm-pilot enemy aircraft.
// AI portada desde D:\quake\gorgon\src\horde.qc (boids: cohesion + alignment +
// separation), adaptada a vuelo libre y persecucion del heli del jugador.
// Reutiliza drone_sound/T_DroneTouch/drone_die de acdrone.qc.

float SWARM_NEIGHBOR_RADIUS = 220;
float SWARM_SEP_RADIUS      = 260;
float SWARM_MAX_SPEED       = 320;  // ~ acdrone cruise (300)
float SWARM_MIN_SPEED       = 220;  // los drones nunca bajan de 300; no se
                                    // arrastra cuando las fuerzas se cancelan
float SWARM_FRONT_TRACE     = 160;
float SWARM_FLOOR_TRACE     = 140;
float SWARM_CEIL_TRACE      = 220;
float SWARM_PURSUIT_SPEED   = 10;    // u/s aplicado hacia el target
// Inercia de velocidad: cuanto pesa la velocidad nueva por tick. 0.75 era
// casi instantaneo; 0.25 da ~170 deg/s de giro efectivo en redirecciones
// fuertes (acdrone usa avelocity_y de hasta 100 deg/s, asi que sigue siendo
// agil sin ser brusco).
float SWARM_VEL_BLEND       = 0.50;

// Multiplicador roll-por-yaw para banking visual cuando vira.
float SWARM_BANK_MULT       = 4;

// Preferencia horizontal: amortigua el movimiento vertical para que el swarm
// no se clave en picado hacia el heli. SWARM_Z_DAMP recorta la velocidad Z
// por tick; SWARM_PURSUIT_Z reduce cuanto del vector de persecucion va en Z
// (1 = persigue igual en vertical; 0.35 = persigue casi todo en horizontal).
float SWARM_Z_DAMP          = 0.7;
float SWARM_PURSUIT_Z       = 0.35;

// Altitud de crucero: empuja suavemente hacia la banda de nubes.
// CLOUD_LAYER_Z = 1740 (types.js). La fuerza se aplica DESPUES del Z damp
// para que no quede inmediatamente anulada.
float SWARM_CRUISE_ALT     = 1740;  // centro de la banda de nubes (types.js)
float SWARM_ALT_SPREAD     = 400;   // scatter individual: ±este valor alrededor del centro
float SWARM_ALT_BAND       = 220;   // zona muerta: sin fuerza dentro de ±este margen
float SWARM_ALT_GAIN       = 0.9;   // fuerza/u fuera de la banda
float SWARM_ALT_FORCE_MAX  = 150;   // techo de la fuerza de retorno en Z

// --- Hospital raids -----------------------------------------------------
// Every SWARM_RAID_MIN..MAX seconds a drone decides to go bomb a HOSPITAL: it
// flies to a random standing hospital, fires SWARM_RAID_SHOTS missiles at it,
// then drops the raid and goes back to its usual flocking / player-hunting.
// Drone raid state lives on:
//   self.attack_state : 0 = normal, 1 = raiding a hospital
//   self.enemy        : the hospital being raided (when state 1)
//   self.search_time  : next time (state 0) it may decide to raid
//   self.count        : missiles left to fire in this raid
//   self.attack_finished : next time it may fire a raid missile (per-shot gap)
float SWARM_RAID_MIN     = 5;    // min seconds between raid decisions
float SWARM_RAID_MAX     = 9;    // max seconds between raid decisions
float SWARM_RAID_SHOTS   = 3;    // missiles per raid
float SWARM_RAID_GAP     = 0.5;  // seconds between the raid's missiles
float SWARM_RAID_RANGE   = 1300; // close enough to launch at the hospital
float SWARM_RAID_PURSUIT = 220;  // STRONG drive toward the hospital while
                                 // raiding (vs the weak SWARM_PURSUIT_SPEED=10
                                 // used for the loose player chase) — this is
                                 // what makes them actually CLOSE IN and fire

// How far a swarm drone looks for a Davenport ground unit to attack when it
// has no player target.
float SWARM_GROUND_HUNT_RADIUS = 2500;
// Forward decl: defined just below swarm_find_target (which calls it).
entity(float maxd) swarm_nearest_ground_unit;

// The player's vehicle if the star gate allows engaging it, else world.
entity() swarm_find_target =
{
	local entity p;
	local entity best;
	local float bestd;
	local float d;

	best = world;
	bestd = 999999;
	p = find(world, classname, "player");
	while (p)
	{
		if (((p.health > 0) && p.enemy))
		{
			if ((p.enemy.health > 0))
			{
				if (Stars_EnemyShouldEngage(p))
				{
					d = vlen((p.enemy.origin - self.origin));
					if ((d < bestd))
					{
						best = p.enemy;
						bestd = d;
					}
				}
			}
		}
		p = find(p, classname, "player");
	}
	return best;
};

// Nearest living friendly (T1) ground vehicle within `maxd` (world if none).
// These are the Davenport counterforce cars / anti-air that the swarm fights.
entity(float maxd) swarm_nearest_ground_unit =
{
	local entity e;
	local entity best;
	local float bestd;
	local float d;

	best = world;
	bestd = maxd;
	// Counterforce vehicle classes (ground, friendly to the player = T1).
	e = find(world, classname, "monster_ehmmv");
	while (e)
	{
		if ((e.health > 0) && (e.ts == T1))
		{
			d = vlen((e.origin - self.origin));
			if (d < bestd) { bestd = d; best = e; }
		}
		e = find(e, classname, "monster_ehmmv");
	}
	e = find(world, classname, "monster_emsam");
	while (e)
	{
		if ((e.health > 0) && (e.ts == T1))
		{
			d = vlen((e.origin - self.origin));
			if (d < bestd) { bestd = d; best = e; }
		}
		e = find(e, classname, "monster_emsam");
	}
	return best;
};

// Pick a random standing (not destroyed) hospital, world if none.
entity() swarm_pick_hospital =
{
	local entity h;
	local entity best;
	local float n;
	local float pickn;

	n = 0;
	h = find(world, classname, "info_hospital");
	while (h)
	{
		if (!h.hosp_destroyed) { n = (n + 1); }
		h = find(h, classname, "info_hospital");
	}
	if (n <= 0) return world;

	pickn = floor(random() * n);
	if (pickn >= n) { pickn = (n - 1); }
	best = world;
	n = 0;
	h = find(world, classname, "info_hospital");
	while (h)
	{
		if (!h.hosp_destroyed)
		{
			if (n == pickn) { best = h; }
			n = (n + 1);
		}
		h = find(h, classname, "info_hospital");
	}
	return best;
};

vector() swarm_cohesion =
{
	local entity h;
	local vector avg;
	local float n;

	avg = self.origin;
	n = 1;
	h = findradius(self.origin, SWARM_NEIGHBOR_RADIUS);
	while (h)
	{
		if (((h != self) && (h.classname == self.classname)))
		{
			avg = (avg + h.origin);
			n = (n + 1);
		}
		h = h.chain;
	}
	avg = (avg * (1 / n));
	return (avg - self.origin);
};

vector() swarm_alignment =
{
	local entity h;
	local vector avg;
	local float n;

	avg = self.velocity;
	n = 1;
	h = findradius(self.origin, SWARM_NEIGHBOR_RADIUS);
	while (h)
	{
		if (((h != self) && (h.classname == self.classname)))
		{
			avg = (avg + h.velocity);
			n = (n + 1);
		}
		h = h.chain;
	}
	avg = (avg * (1 / n));
	return (avg - self.velocity);
};

vector() swarm_separation =
{
	local entity h;
	local vector push;
	local vector d;
	local float dist;

	push = '0 0 0';
	h = findradius(self.origin, SWARM_SEP_RADIUS);
	while (h)
	{
		if (((h != self) && (h.classname == self.classname)))
		{
			d = (self.origin - h.origin);
			dist = vlen(d);
			if (((dist > 0) && (dist < SWARM_SEP_RADIUS)))
			{
				push = (push + (normalize(d) * (SWARM_SEP_RADIUS - dist)));
			}
		}
		h = h.chain;
	}
	return push;
};

vector(entity tgt) swarm_pursuit =
{
	local vector toward;
	local float dist;

	if (!tgt)
		return '0 0 0';
	toward = (tgt.origin - self.origin);
	dist = vlen(toward);
	if ((dist < 1))
		return '0 0 0';
	return (normalize(toward) * SWARM_PURSUIT_SPEED);
};

vector() swarm_environment =
{
	local vector push;

	push = '0 0 0';
	makevectors(vectoangles(self.velocity));

	traceline(self.origin, (self.origin + (v_forward * SWARM_FRONT_TRACE)), FALSE, self);
	if ((trace_fraction < 1))
	{
		push = ((push - (v_forward * 350)) + (v_up * 180));
	}

	traceline(self.origin, (self.origin + (v_right * 100)), FALSE, self);
	if ((trace_fraction < 1))
	{
		push = (push - (v_right * 120));
	}

	traceline(self.origin, (self.origin - (v_right * 100)), FALSE, self);
	if ((trace_fraction < 1))
	{
		push = (push + (v_right * 120));
	}

	traceline(self.origin, (self.origin + ('0 0 -1' * SWARM_FLOOR_TRACE)), FALSE, self);
	if ((trace_fraction < 1))
	{
		push = (push + ('0 0 1' * 260));
	}

	traceline(self.origin, (self.origin + ('0 0 1' * SWARM_CEIL_TRACE)), FALSE, self);
	if ((trace_fraction < 1))
	{
		push = (push + ('0 0 -1' * 120));
	}

	return push;
};

// Limites del mundo. El editor envuelve el mapa con un "sky box" en
// ±WORLD_HALF (X/Y) y entre el lecho rocoso y el techo de cielo (Z). NO
// usamos world.absmin/absmax: como hay esa caja envolvente, ese bbox es la
// caja entera y nunca detectaria que el avion la traspasa. En su lugar
// comparamos contra los limites fijos del mundo (mismos valores que
// types.js: WORLD_HALF=16384, BEDROCK_TOP_Z=-128, SKY_TOP_Z). Si el pilot
// los cruza, ha atravesado el sky box y hay que rescatarlo.
float SWARM_WORLD_HALF = 16384;   // ±X / ±Y (types.js WORLD_HALF)
float SWARM_WORLD_ZMIN = -256;    // un poco bajo el lecho (BEDROCK_TOP_Z=-128)
float SWARM_WORLD_ZMAX = 4608;    // sobre el techo de cielo (SKY_TOP_Z=4096)
// Altura (sobre el suelo) a la que se guarda el punto de reaparicion del
// rescate, para que el teleport caiga en aire libre y el avion no aparezca
// metido en el terreno.
float SWARM_RESCUE_ALT = 512;

// TRUE si el pilot ha salido del volumen jugable del mundo.
float() swarm_out_of_bounds =
{
	if ((self.origin_x < (0 - SWARM_WORLD_HALF)) || (self.origin_x > SWARM_WORLD_HALF))
		return TRUE;
	if ((self.origin_y < (0 - SWARM_WORLD_HALF)) || (self.origin_y > SWARM_WORLD_HALF))
		return TRUE;
	if ((self.origin_z < SWARM_WORLD_ZMIN) || (self.origin_z > SWARM_WORLD_ZMAX))
		return TRUE;
	return FALSE;
};


// Rescate: teleporta el pilot al swarm_home (posicion de spawn) MAS LEJANO de
// su posicion fuera-de-mapa actual, y le da un yaw aleatorio + velocidad
// hacia delante. Recorre g_swarm_head (lista de pilots) y se queda con el
// swarm_home mas distante. Los swarm_home se guardan YA ELEVADOS a altura de
// vuelo (ver swarm_pilot_start), asi que el destino esta en aire libre y no
// dentro del suelo — clave para no caer en un bucle de T_DroneTouch.
//
// Aun asi, ANTES de mover comprobamos con un traceline que el punto destino
// esta despejado; si por lo que sea estuviera ocupado, subimos el destino en
// pasos hasta encontrar aire. Solo cuando hay hueco hacemos setorigin (que
// devuelve si el reposicionamiento es solido). Si nada funciona, no movemos
// (mejor dejarlo donde esta que meterlo en un muro y que explote en cascada).
void() swarm_rescue =
{
	local entity e;
	local vector best;
	local float bestd;
	local float d;
	local float yaw;
	local float tries;

	best = self.swarm_home;        // por defecto, su propio spawn
	bestd = -1;
	e = g_swarm_head;
	while (e)
	{
		// swarm_home == '0 0 0' marca "sin spawn guardado"; lo ignoramos.
		if ((e.swarm_home != '0 0 0'))
		{
			d = vlen((e.swarm_home - self.origin));
			if ((d > bestd))
			{
				bestd = d;
				best = e.swarm_home;
			}
		}
		e = e.swarm_next;
	}

	// Si no hay ningun spawn valido, no teleportamos a ciegas — abortamos.
	if ((best == '0 0 0'))
	{
		return;
	}

	// Busca un destino DESPEJADO: si el punto esta dentro de algo solido,
	// sube 128u y reintenta (hasta 6 veces). No movemos a un punto ocupado.
	tries = 0;
	while (tries < 6)
	{
		traceline(best, best, TRUE, self);
		if (!trace_startsolid)
		{
			setorigin(self, best);
			yaw = (random() * 360);
			self.angles_x = 0;
			self.angles_y = yaw;
			self.angles_z = 0;
			makevectors(self.angles);
			self.velocity = (v_forward * SWARM_MIN_SPEED);
			self.speed = SWARM_MIN_SPEED;
			return;
		}
		best_z = (best_z + 128);
		tries = (tries + 1);
	}
};

// Correa al spawn: mientras el pilot esta dentro de SWARM_LEASH_RADIUS de su
// swarm_home, no tira nada (persigue al jugador libremente). Mas alla, aparece
// una fuerza de retorno hacia el spawn que crece con la distancia, como una
// goma elastica — asi el swarm orbita su zona de spawn en vez de seguir al
// heli hasta el borde del mapa. Es la causa-raiz del problema "se va lejisimos
// y acaba fuera del mapa". Solo en el plano horizontal (no fuerza altitud).
float SWARM_LEASH_RADIUS = 2400;   // radio libre alrededor del spawn
float SWARM_LEASH_GAIN   = 0.18;   // intensidad del tiron por u de exceso

vector() swarm_homing =
{
	local vector toward;
	local float dist;
	local float excess;

	if ((self.swarm_home == '0 0 0'))
		return '0 0 0';
	toward = (self.swarm_home - self.origin);
	toward_z = 0;                     // solo horizontal
	dist = vlen(toward);
	if ((dist <= SWARM_LEASH_RADIUS))
		return '0 0 0';
	excess = (dist - SWARM_LEASH_RADIUS);
	return (normalize(toward) * (excess * SWARM_LEASH_GAIN));
};

void() swarm_pilot_fly =
{
	local vector newvel;
	local vector cohesion;
	local vector alignment;
	local vector separation;
	local vector pursuit;
	local vector environment;
	local vector homing;
	local entity tgt;
	local float spd;

	// Red de seguridad: el swarm_environment evita los bordes con tracelines,
	// pero si aun asi el pilot se sale del mapa, lo teleportamos al spawn mas
	// lejano con un rumbo nuevo en vez de dejarlo perdido en el vacio.
	if (swarm_out_of_bounds())
	{
		swarm_rescue();
		self.think = swarm_pilot_fly;
		self.nextthink = (time + 0.1);
		return;
	}

	// --- Raid / strafe state machine ---
	// State 0 (normal): every so often, decide to attack a target — a nearby
	// Davenport GROUND UNIT (the immediate threat) if one is in range, else a
	// HOSPITAL. Either way it's a "raid": close in and fire missiles.
	if ((self.attack_state == 0))
	{
		if ((self.search_time <= time))
		{
			local entity raidtgt;
			// Prefer a friendly (T1) ground vehicle nearby; fall back to a
			// hospital. Both get strafed from the air with missiles.
			raidtgt = swarm_nearest_ground_unit(SWARM_GROUND_HUNT_RADIUS);
			if (raidtgt == world) { raidtgt = swarm_pick_hospital(); }
			if (raidtgt != world)
			{
				self.attack_state = 1;
				self.enemy = raidtgt;         // raid target
				self.count = SWARM_RAID_SHOTS;
				self.attack_finished = time;  // can fire as soon as in range
			}
			// Re-arm the decision timer either way.
			self.search_time = (time + SWARM_RAID_MIN
				+ (random() * (SWARM_RAID_MAX - SWARM_RAID_MIN)));
		}
	}
	else
	{
		// State 1 (raiding): abort if the target is gone — dead, removed, or a
		// destroyed hospital. (health<=0 covers ground units; hosp_destroyed
		// covers a flattened hospital that still exists as a prop.)
		if ((self.enemy == world) || (self.enemy.health <= 0)
			|| (self.enemy.hosp_destroyed))
		{
			self.attack_state = 0;
			self.enemy = world;
		}
	}

	// Pick the steering target: while raiding, fly to the hospital; otherwise
	// chase the player if the star gate allows (else just flock).
	if ((self.attack_state == 1))
		tgt = self.enemy;
	else
		tgt = swarm_find_target();

	cohesion    = swarm_cohesion();
	alignment   = swarm_alignment();
	separation  = swarm_separation();
	pursuit     = swarm_pursuit(tgt);
	environment = swarm_environment();
	homing      = swarm_homing();

	// While RAIDING, drive HARD at the hospital. The normal swarm_pursuit is a
	// weak nudge (SWARM_PURSUIT_SPEED=10) that the flocking forces drown out —
	// which is why drones "decided" to raid but never actually arrived. Replace
	// it with a strong straight-line drive so they commit to the attack run.
	if ((self.attack_state == 1) && (self.enemy != world))
	{
		pursuit = (normalize((self.enemy.origin - self.origin)) * SWARM_RAID_PURSUIT);
		// Damp cohesion/alignment so they peel off the flock to attack.
		cohesion = (cohesion * 0.2);
		alignment = (alignment * 0.2);
		// Keep the FULL vertical drive while raiding: the hospital is down on
		// the ground, so they must descend to get within firing range. (The
		// pursuit_z damp below only applies to the loose, non-raid chase.)
	}
	else
	{
		// Soften the dive in normal flight: chase mostly horizontally so the
		// swarm doesn't nose-dive. It shoots from the air, never rams.
		pursuit_z = (pursuit_z * SWARM_PURSUIT_Z);
	}

	// Raid fire: in range of the hospital and off cooldown → loose a missile.
	// After SWARM_RAID_SHOTS, end the raid and go back to normal.
	if ((self.attack_state == 1) && (self.attack_finished <= time))
	{
		local vector tv;
		local vector tdir;
		tv = (self.enemy.origin + ((self.enemy.mins + self.enemy.maxs) * 0.5));
		if ((vlen((tv - self.origin)) <= SWARM_RAID_RANGE))
		{
			tdir = normalize((tv - self.origin));
			AC_heatseeker((self.origin + (tdir * 16)), tdir, self.enemy);
			self.attack_finished = (time + SWARM_RAID_GAP);
			self.count = (self.count - 1);
			if ((self.count <= 0))
			{
				self.attack_state = 0;        // raid done → back to normal
				self.enemy = world;
			}
		}
	}

	newvel = self.velocity;
	newvel = (newvel + (cohesion * 0.05));
	newvel = (newvel + (alignment * 0.5));
	newvel = (newvel + (separation * 0.4));
	newvel = (newvel + (pursuit * 0.6));
	newvel = (newvel + environment);
	newvel = (newvel + homing);

	newvel_x = (newvel_x + ((random() - 0.5) * 6));
	newvel_y = (newvel_y + ((random() - 0.5) * 6));
	newvel_z = (newvel_z + ((random() - 0.5) * 6));

	// Prefer horizontal travel: damp the vertical velocity so it glides
	// rather than porpoising / steep-diving while flocking and chasing.
	newvel_z = (newvel_z * SWARM_Z_DAMP);

	// Restoring force toward cloud-band cruise altitude (SWARM_CRUISE_ALT).
	// Applied AFTER the Z damp so it isn't immediately cancelled out.
	{
		local float dz;
		local float push_z;
		dz = (self.swarm_cruise_alt - self.origin_z);
		if (dz > SWARM_ALT_BAND)
		{
			push_z = ((dz - SWARM_ALT_BAND) * SWARM_ALT_GAIN);
			if (push_z > SWARM_ALT_FORCE_MAX) { push_z = SWARM_ALT_FORCE_MAX; }
			newvel_z = (newvel_z + push_z);
		}
		else if (dz < (0 - SWARM_ALT_BAND))
		{
			push_z = (((0 - dz) - SWARM_ALT_BAND) * SWARM_ALT_GAIN);
			if (push_z > SWARM_ALT_FORCE_MAX) { push_z = SWARM_ALT_FORCE_MAX; }
			newvel_z = (newvel_z - push_z);
		}
	}

	spd = vlen(newvel);
	if ((spd > SWARM_MAX_SPEED))
	{
		newvel = (normalize(newvel) * SWARM_MAX_SPEED);
	}
	if (((spd > 0) && (spd < SWARM_MIN_SPEED)))
	{
		newvel = (normalize(newvel) * SWARM_MIN_SPEED);
	}
	if ((spd == 0))
	{
		makevectors(self.angles);
		newvel = (v_forward * SWARM_MIN_SPEED);
	}

	self.velocity = ((self.velocity * (1 - SWARM_VEL_BLEND)) + (newvel * SWARM_VEL_BLEND));

	// Banking visual: roll proporcional al delta de yaw, como los drones
	// vanilla. vectoangles() devuelve roll=0, asi que lo escribimos despues.
	local float old_yaw;
	local float yaw_delta;
	old_yaw = self.angles_y;
	self.angles = vectoangles(self.velocity);
	yaw_delta = anglemod((self.angles_y - old_yaw));
	if ((yaw_delta > 180))
	{
		yaw_delta = (yaw_delta - 360);
	}
	self.angles_z = ((0 - yaw_delta) * SWARM_BANK_MULT);
	if ((self.angles_z > 60))
	{
		self.angles_z = 60;
	}
	if ((self.angles_z < -60))
	{
		self.angles_z = -60;
	}

	self.speed = vlen(self.velocity);
	self.thru = 4;

	if ((self.flags & FL_ONGROUND))
	{
		self.flags = (self.flags - FL_ONGROUND);
		self.groundentity = world;
	}

	drone_sound();

	self.think = swarm_pilot_fly;
	self.nextthink = (time + 0.1);
};

void() swarm_pilot_start =
{
	if (((deathmatch > 0) && ((self.team == 0) || (teamplay == 0))))
	{
		remove(self);
		return;
	}
	if (!deathmatch)
	{
		total_monsters = (total_monsters + 1);
	}
	self.takedamage = DAMAGE_AIM;
	self.view_ofs = '0 0 1';
	self.flags = (self.flags | FL_MONSTER);

	// First hospital-raid decision is staggered into the 10-15s window so the
	// drones don't all peel off to raid at the same instant.
	self.attack_state = 0;
	self.enemy = world;
	self.search_time = (time + SWARM_RAID_MIN
		+ (random() * (SWARM_RAID_MAX - SWARM_RAID_MIN)));

	makevectors(self.angles);
	self.velocity = (v_forward * SWARM_MIN_SPEED);

	// Punto de reaparicion para el rescate fuera-de-mapa. Lo registramos aqui
	// (no en monster_swarm_pilot) porque para entonces el avion YA esta en su
	// posicion definitiva de vuelo (el sistema de slots lo coloca antes de
	// arrancar). Trazamos hacia el suelo y guardamos el home a SWARM_RESCUE_ALT
	// por encima — asi el destino del teleport esta SIEMPRE en aire libre y no
	// dentro del terreno, que era lo que metia al avion en un bucle de choque.
	traceline(self.origin, (self.origin + ('0 0 -1' * 8192)), TRUE, self);
	if ((trace_fraction < 1) && !trace_startsolid)
		self.swarm_home = (trace_endpos + ('0 0 1' * SWARM_RESCUE_ALT));
	else
		self.swarm_home = self.origin;   // sin suelo bajo: usa su propio origen
	self.swarm_next = g_swarm_head;
	g_swarm_head = self;

	// Altitud de crucero individual: scatter aleatorio ±SWARM_ALT_SPREAD
	// alrededor del centro de la banda de nubes, para que el grupo vuele
	// escalonado en lugar de pegado a la misma cota.
	self.swarm_cruise_alt = SWARM_CRUISE_ALT + ((random() - 0.5) * 2 * SWARM_ALT_SPREAD);

	self.think = swarm_pilot_fly;
	self.nextthink = ((time + 0.1) + (random() * 0.4));
};

void() monster_swarm_pilot =
{
	// Set classname explicitly: when spawned at RUNTIME (Swarm_SpawnOne) there
	// is no .map entity, so without this the classname stays empty and
	// find(world, classname, "monster_swarm_pilot") finds NONE — the alive-cap
	// counted 0 and the drones piled up without bound. (Editor-placed ones get
	// it from the .map, runtime ones need it here.)
	self.classname = "monster_swarm_pilot";
	self.solid = SOLID_SLIDEBOX;
	self.movetype = MOVETYPE_FLY;
	setmodel(self, "progs/plane1.mdl");
	setsize(self, '-12 -12 -12', '12 12 12');
	if (!self.health)
	{
		self.health = 60;
	}
	self.netname = "Swarm Pilot";
	setup_teament();
	self.touch = T_DroneTouch;
	self.th_die = drone_die;
	// Standard Quake AI (FoundTarget/HuntTarget in ai.qc) reassigns
	// self.think = self.th_run when the monster takes damage from a
	// non-team-mate. Without th_run wired up, that turns into
	// "PR_ExecuteProgram: NULL function" the next frame. Point it at
	// our normal flight loop so the swarm just keeps doing its thing.
	self.th_run = swarm_pilot_fly;
	self.think = swarm_pilot_start;
	self.nextthink = ((time + 0.1) + (random() * 0.1));
};

// --- Periodic swarm-drone spawner ---------------------------------------
// A fresh swarm drone drops in every SWARM_SPAWN_PERIOD seconds (driven from
// day.qc). It appears high in the open sky over a random pickup (or map
// centre) so it never spawns inside geometry, with a little XY scatter, then
// flocks/drifts and chases the player only when the star gate allows it (the
// gating lives in swarm_find_target).

float SWARM_SPAWN_SKY_Z   = 1900;  // spawn altitude: just above cloud band (1740)
float SWARM_SPAWN_SPREAD  = 768;   // XY scatter at spawn

void(vector center) spawn_swarm_drone_at =
{
	local entity m;
	local vector org;
	local float tries;
	local float c;

	org = center;
	org_z = SWARM_SPAWN_SKY_Z;
	org_x = (org_x + ((random() - 0.5) * 2 * SWARM_SPAWN_SPREAD));
	org_y = (org_y + ((random() - 0.5) * 2 * SWARM_SPAWN_SPREAD));

	// Safe spawn: never start inside solid/sky (it'd touch world and die in a
	// loop). Step down into open air; bail if nothing clear within reach.
	c = pointcontents(org);
	tries = 0;
	while (((c == CONTENT_SOLID) || (c == CONTENT_SKY)) && (tries < 24))
	{
		org_z = (org_z - 128);
		c = pointcontents(org);
		tries = (tries + 1);
	}
	if ((c == CONTENT_SOLID) || (c == CONTENT_SKY)) { return; }

	m = spawn();
	setorigin(m, org);
	m.angles_y = (random() * 360);
	m.team = 0;                  // enemy faction
	m.from_slot = 1;            // survive the day-start hand-placed purge
	local entity osave;
	osave = self;
	self = m;
	monster_swarm_pilot();       // wires model/AI/touch/die + the start think
	self = osave;
};

// Spawn one swarm drone over a random info_pickup (or the map origin if there
// are none). Called periodically from day.qc.
float SWARM_MAX_ALIVE = 10;  // cap on concurrent swarm drones (perf + balance)

void() Swarm_SpawnOne =
{
	local entity p;
	local entity chosen;
	local float total;
	local float pickn;
	local float i;
	local float alive;
	local vector center;

	// Don't pile up forever (one spawns every 8s): skip when there are already
	// plenty of swarm drones in the air.
	alive = 0;
	p = find(world, classname, "monster_swarm_pilot");
	while (p) { alive = (alive + 1); p = find(p, classname, "monster_swarm_pilot"); }
	if (alive >= SWARM_MAX_ALIVE) return;

	total = 0;
	p = find(world, classname, "info_pickup");
	while (p) { total = (total + 1); p = find(p, classname, "info_pickup"); }

	center = '0 0 0';
	if (total > 0)
	{
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
		if (chosen != world) { center = chosen.origin; }
	}
	spawn_swarm_drone_at(center);
};
