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
				d = vlen((p.enemy.origin - self.origin));
				if ((d < bestd))
				{
					best = p.enemy;
					bestd = d;
				}
			}
		}
		p = find(p, classname, "player");
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

void() swarm_pilot_fly =
{
	local vector newvel;
	local vector cohesion;
	local vector alignment;
	local vector separation;
	local vector pursuit;
	local vector environment;
	local entity tgt;
	local float spd;

	tgt = swarm_find_target();

	cohesion    = swarm_cohesion();
	alignment   = swarm_alignment();
	separation  = swarm_separation();
	pursuit     = swarm_pursuit(tgt);
	environment = swarm_environment();

	newvel = self.velocity;
	newvel = (newvel + (cohesion * 0.05));
	newvel = (newvel + (alignment * 0.5));
	newvel = (newvel + (separation * 0.4));
	newvel = (newvel + (pursuit * 0.6));
	newvel = (newvel + environment);

	newvel_x = (newvel_x + ((random() - 0.5) * 6));
	newvel_y = (newvel_y + ((random() - 0.5) * 6));
	newvel_z = (newvel_z + ((random() - 0.5) * 6));

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

	makevectors(self.angles);
	self.velocity = (v_forward * SWARM_MIN_SPEED);

	self.think = swarm_pilot_fly;
	self.nextthink = ((time + 0.1) + (random() * 0.4));
};

void() monster_swarm_pilot =
{
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
