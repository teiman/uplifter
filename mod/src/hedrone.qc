//Decompiled code. Please respect the original copyright.
void(vector v0) turn_hedrone;
void() hedrone_run;

vector(float minim, float maxdist) Drone_aim =
{
	local entity e;
	local entity re;
	local float f1;
	local float f2;
	local float flg;
	local vector v1;
	local vector v2;
	local vector org;

	flg = 0;
	if ((maxdist < 0))
	{
		flg = (flg + 1);
		maxdist = (0 - maxdist);
	}
	re = world;
	f2 = minim;
	makevectors(self.angles);
	v1 = v_forward;
	v1_z = (0 - v1_z);
	e = findradius(self.origin, maxdist);
	while (e)
	{
		org = (e.origin + ((e.mins + e.maxs) * 0.5));
		if ((e.health && ((e.movetype != MOVETYPE_FLY) || ((flg & 1) == 0))))
		{
			traceline(org, self.enemy.origin, TRUE, world);
			if ((e.model == "progs/plane3.mdl"))
			{
				if (((e.skin == 1) && (random() < 0.5)))
				{
					trace_fraction = 0;
				}
			}
			if ((trace_fraction == 1))
			{
				v2 = normalize((org - self.origin));
				f1 = (v1 * v2);
				if ((f1 > f2))
				{
					f2 = f1;
					re = e;
				}
			}
		}
		e = e.chain;
	}
	if ((re != world))
	{
		org = (re.origin + ((re.mins + re.maxs) * 0.5));
		v1 = normalize((org - self.enemy.origin));
	}
	self.aiment = re;
	return (v1);
};

void() he_movetogoal =
{
	local vector v0;
	local vector v1;
	local vector v2;
	local vector v3;
	local float tmp;
	local float tmp2;
	local entity e;
	local entity e2;

	if (!self.goalentity)
	{
		return;
	}
	v1 = (self.goalentity.origin + ((self.goalentity.mins + self.goalentity.maxs) * 0.5));
	e = findradius(self.origin, 256);
	tmp = 256;
	while (e)
	{
		if ((e.takedamage && (e != self)))
		{
			tmp2 = vlen((self.origin - e.origin));
			if ((tmp2 < tmp))
			{
				tmp = tmp2;
				v1 = (self.origin + (normalize((self.origin - e.origin)) * 256));
				if (((e.classname == "monster_helo") && (e.movetarget == self.movetarget)))
				{
					self.goalentity = find(world, targetname, self.goalentity.target);
					self.movetarget = find(world, targetname, self.goalentity.target);
				}
			}
		}
		e = e.chain;
	}
	v0 = vectoangles((v1 - self.origin));
	tmp = 0;
	traceline((self.origin + '-32 -32 -32'), v1, TRUE, world);
	tmp = (tmp + trace_fraction);
	traceline((self.origin + '32 -32 -32'), v1, TRUE, world);
	tmp = (tmp + trace_fraction);
	traceline((self.origin + '-32 32 -32'), v1, TRUE, world);
	tmp = (tmp + trace_fraction);
	traceline((self.origin + '32 32 -32'), v1, TRUE, world);
	tmp = (tmp + trace_fraction);
	traceline((self.origin + '-32 -32 32'), v1, TRUE, world);
	tmp = (tmp + trace_fraction);
	traceline((self.origin + '32 -32 32'), v1, TRUE, world);
	tmp = (tmp + trace_fraction);
	traceline((self.origin + '-32 32 32'), v1, TRUE, world);
	tmp = (tmp + trace_fraction);
	traceline((self.origin + '32 32 32'), v1, TRUE, world);
	tmp = (tmp + trace_fraction);
	if ((tmp < 8))
	{
		if ((self.goalentity != self.enemy))
		{
			e = self.movetarget;
			e2 = e;
			e = find(world, targetname, e.target);
			tmp = 0;
			while (((e != e2) && (tmp < 8)))
			{
				tmp = (tmp + 1);
				if (((e != world) && visible(e)))
				{
					self.movetarget = e;
					self.goalentity = e;
					e2 = e;
				}
				else
				{
					e = find(world, targetname, e.target);
					if ((e == world))
					{
						e = find(world, targetname, self.target);
					}
				}
			}
		}
		if ((self.lefty < 0))
		{
			self.lefty = (random() > 0.5);
		}
		if ((time > self.search_time))
		{
			self.lefty = (1 - self.lefty);
			self.search_time = (time + 30);
		}
		if (self.lefty)
		{
			v0_y = anglemod((v0_y + 90));
		}
		else
		{
			v0_y = anglemod((v0_y - 90));
		}
	}
	else
	{
		self.lefty = -1;
	}
	self.thru = 2;
	v2 = (v1 - self.origin);
	v2_z = 0;
	tmp2 = vlen(v2);
	if (((self.origin_z - v1_z) > (tmp2 * 1)))
	{
		self.thru = 1;
	}
	if (((v1_z - self.origin_z) > (tmp2 * 0.5)))
	{
		self.thru = 3;
	}
	if ((((self.origin_z - v1_z) > (tmp2 * 2)) && (fabs((self.origin_z - v1_z)) > 128)))
	{
		self.thru = 0;
	}
	if (((v1_z - self.origin_z) > (tmp2 * 1)))
	{
		self.thru = 4;
	}
	v2 = v0;
	v0_x = 0;
	v0_z = 0;
	v1 = v2;
	v2 = (v1 - self.angles);
	v2_x = 0;
	v2_z = 0;
	if ((self.goalentity == self.enemy))
	{
		if ((tmp2 < 256))
		{
			if ((fabs((self.origin_z - self.enemy.origin_z)) < (256 - tmp2)))
			{
				if ((self.origin_z > self.enemy.origin_z))
				{
					self.thru = 4;
				}
				else
				{
					self.thru = 0;
				}
			}
			else
			{
				if ((self.origin_z > self.enemy.origin_z))
				{
					self.thru = 0;
				}
				else
				{
					self.thru = 4;
				}
			}
			tmp2 = ((tmp2 * 0.4) - 57);
		}
		else
		{
			tmp2 = 45;
		}
	}
	else
	{
		if ((tmp2 < 256))
		{
			tmp2 = (6 + (tmp2 * 0.15));
		}
		else
		{
			tmp2 = 45;
		}
		tmp = anglemod((v0_y - self.angles_y));
		if ((tmp > 180))
		{
			tmp = (tmp - 360);
		}
		if ((fabs(tmp) > 12))
		{
			tmp2 = 0;
		}
	}
	makevectors(v2);
	tmp = v_forward_x;
	v0_x = (v0_x - (tmp2 * tmp));
	tmp = v_forward_y;
	v0_z = (v0_z - (tmp2 * tmp));
	v1 = (self.angles_y * '0 1 0');
	makevectors(v1);
	v3 = (self.origin + (self.velocity * 0.8));
	if ((self.goalentity == self.enemy))
	{
		tmp = 128;
	}
	else
	{
		tmp = 32;
	}
	if (((self.goalentity == self.enemy) || (vlen((self.goalentity.origin - self.origin)) > 64)))
	{
		traceline(self.origin, (v3 + (v_forward * tmp)), TRUE, world);
		if ((trace_fraction < 1))
		{
			v0_x = 45;
		}
		traceline(self.origin, (v3 - (v_forward * tmp)), TRUE, world);
		if ((trace_fraction < 1))
		{
			v0_x = -45;
		}
		traceline(self.origin, (v3 + (v_right * tmp)), TRUE, world);
		if ((trace_fraction < 1))
		{
			v0_z = -45;
		}
		traceline(self.origin, (v3 - (v_right * tmp)), TRUE, world);
		if ((trace_fraction < 1))
		{
			v0_z = 45;
		}
		traceline(self.origin, (v3 + (v_up * tmp)), TRUE, world);
		if ((trace_fraction < 1))
		{
			self.thru = 0;
		}
		traceline(self.origin, (v3 - (v_up * tmp)), TRUE, world);
		if ((trace_fraction < 1))
		{
			self.thru = 4;
		}
	}
	turn_hedrone(v0);
};

void(vector v0) turn_hedrone =
{
	local vector v1;
	local vector v2;
	local vector v3;

	if (((self.health > 0) && !(self.flags & FL_ONGROUND)))
	{
		if ((v0_x > 45))
		{
			v0_x = 45;
		}
		if ((v0_x < -45))
		{
			v0_x = -45;
		}
		v1 = '0 0 0';
		v1_y = anglemod((v0_y - self.angles_y));
		if ((v1_y > 180))
		{
			v1_y = (v1_y - 360);
		}
		v1_x = (v0_x - self.angles_x);
		v2 = '0 0 0';
		if ((v1_x < 0))
		{
			v2_x = -90;
		}
		if ((v1_x > 0))
		{
			v2_x = 90;
		}
		if ((fabs(v1_x) < 9))
		{
			v2_x = 0;
			self.angles_x = v0_x;
		}
		if ((v1_y < 0))
		{
			v2_y = -110;
		}
		if ((v1_y > 0))
		{
			v2_y = 110;
		}
		if ((fabs(v1_y) < 11))
		{
			v2_y = 0;
			self.angles_y = v0_y;
		}
		else
		{
			self.angles_y = anglemod(self.angles_y);
		}
		v0_z = (v0_z - ((v2_y * fabs(self.angles_x)) * 0.01));
		if ((v0_z < -45))
		{
			v0_z = -45;
		}
		if ((v0_z > 45))
		{
			v0_z = 45;
		}
		v1_z = (v0_z - self.angles_z);
		if ((v1_z < 0))
		{
			v2_z = -100;
			if ((v2_z < (v1_z * 10)))
			{
				v2_z = (v1_z * 10);
			}
		}
		if ((v1_z > 0))
		{
			v2_z = 100;
			if ((v2_z > (v1_z * 10)))
			{
				v2_z = (v1_z * 10);
			}
		}
		if ((fabs(v1_z) < (v2_z * frametime)))
		{
			v2_z = 0;
			self.angles_z = (0 - (v2_y * 0.3));
		}
		self.avelocity = v2;
	}
	if ((self.flags & FL_ONGROUND))
	{
		if (((self.groundentity.classname != "func_runway") || (self.thru > 2)))
		{
			self.flags = (self.flags - FL_ONGROUND);
			self.groundentity = world;
			self.velocity_z = (self.velocity_z + 200);
		}
	}
	if (((self.health < 40) && (self.model == "progs/helo1.mdl")))
	{
		setmodel(self, "progs/helo1b.mdl");
	}
	if ((self.health < 1))
	{
		self.effects = 4;
	}
	else
	{
		self.effects = 0;
	}
	v3 = self.angles;
	v3_x = (0 - v3_x);
	makevectors(v3);
	if (((self.thru != 2) || (self.health < 1)))
	{
		v3 = (((v_up * 20) * self.thru) - '0 0 40');
	}
	else
	{
		v3 = ((v_up * ((20 * self.thru) / v_up_z)) - '0 0 40');
	}
	if (!(self.flags & FL_ONGROUND))
	{
		self.velocity = ((self.velocity * 0.8) + v3);
	}
	if ((sky_z && (self.origin_z > sky_z)))
	{
		if ((self.velocity_z > 0))
		{
			self.origin_z = sky_z;
			self.velocity_z = 0;
		}
	}
	Check_minsmaxs(self);
};

void() T_hedroneTouch =
{
	local float damg;
	local float temp;
	local entity stemp2;

	if ((other.solid == SOLID_TRIGGER))
	{
		return;
	}
	if ((other != world))
	{
		if ((!other.takedamage && (other.solid != SOLID_BSP)))
		{
			return;
		}
	}
	if ((other.classname == "func_runway"))
	{
		fabs(self.angles_x);
		if (((fabs(self.angles_z) + fabs(self.angles_z)) < 20))
		{
			self.flags = (self.flags | FL_ONGROUND);
			self.groundentity = other;
			self.angles_x = 0;
			self.angles_z = 0;
			self.avelocity = '0 0 0';
			self.velocity = '0 0 0';
			self.origin_z = ((other.origin_z + other.maxs_z) + 16);
			return;
		}
	}
	// Re-entry guard: a helo that already decided to explode (its think is the
	// pending BecomeExplosion) must NOT run the whole blast again on the next
	// touch. Without this, one wedged in geometry re-fires TE_EXPLOSION every
	// frame — that's what drained the particle budget and made the pressure
	// helos vanish. (Same fix as T_DroneTouch.)
	if ((self.think == BecomeExplosion))
	{
		return;
	}
	WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
	WriteByte(MSG_BROADCAST, TE_EXPLOSION);
	WriteCoord(MSG_BROADCAST, self.origin_x);
	WriteCoord(MSG_BROADCAST, self.origin_y);
	WriteCoord(MSG_BROADCAST, self.origin_z);
	T_Damage(other, self, self, 240);
	if ((((other == world) || (other.health > 0)) || ((self.health < 1) && (time > self.pain_finished))))
	{
		self.origin = (self.origin - (normalize(self.velocity) * 8));
		T_RadiusDamage(self, self, 160, other);
		if ((self.health > 0))
		{
			bprint("Chopper Drone crashed into ");
			if ((other != world))
			{
				bprint(other.netname);
				bprint("\n");
			}
			else
			{
				bprint("the ground\n");
			}
		}
		Throw_ACgib();
		Throw_ACgib();
		Throw_ACgib();
		Throw_ACgib();
		T_Damage(self, self, self, 1000);
		self.think = BecomeExplosion;
		self.nextthink = (time + 0.1);
		// Go inert immediately so it can't keep touching geometry before the
		// explosion think fires (anti-cascade).
		self.touch = SUB_Null;
		self.solid = SOLID_NOT;
		self.movetype = MOVETYPE_NONE;
		self.velocity = '0 0 0';
	}
	else
	{
		if ((self.health > 0))
		{
			self.pain_finished = (time + 0.3);
			bprint("Chopper Drone crashed into ");
			if ((other != world))
			{
				bprint(other.netname);
				bprint("\n");
			}
		}
		T_Damage(self, self, self, 1000);
		self.th_die = SUB_Null;
		if ((self.model == "progs/helo1.mdl"))
		{
			setmodel(self, "progs/helo1b.mdl");
		}
		self.touch = T_hedroneTouch;
		HE_Fall();
	}
};

void() hedrone_die =
{
	WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
	WriteByte(MSG_BROADCAST, TE_EXPLOSION);
	WriteCoord(MSG_BROADCAST, self.origin_x);
	WriteCoord(MSG_BROADCAST, self.origin_y);
	WriteCoord(MSG_BROADCAST, self.origin_z);
	self.pain_finished = (time + 0.3);
	if ((self.model == "progs/helo1.mdl"))
	{
		setmodel(self, "progs/helo1b.mdl");
	}
	self.touch = T_hedroneTouch;
	HE_Fall();
};

void() hedrone_stand =
{
	local vector v0;
	local vector v1;
	local vector v2;
	local vector v3;
	local float a;
	local float b;
	local float oth;

	if ((time > self.fly_sound))
	{
		sound(self, CHAN_BODY, "engines/chopper.wav", ((self.thru * 0.2) + 0.2), ATTN_NORM);
		self.fly_sound = (time + 1);
	}
	oth = self.thru;
	self.thru = 2;
	v0 = self.angles;
	v0_x = (0 - v0_x);
	makevectors(v0);
	v0 = '0 0 0';
	traceline(self.origin, (self.origin + (v_forward * 128)), TRUE, world);
	v0_x = ((v0_x + 45) - (trace_fraction * 45));
	traceline(self.origin, (self.origin - (v_forward * 128)), TRUE, world);
	v0_x = ((v0_x - 45) + (trace_fraction * 45));
	traceline(self.origin, (self.origin + (v_right * 128)), TRUE, world);
	v0_z = ((v0_z - 45) + (trace_fraction * 45));
	traceline(self.origin, (self.origin - (v_right * 128)), TRUE, world);
	v0_z = ((v0_z + 45) - (trace_fraction * 45));
	traceline(self.origin, (self.origin + (v_up * 128)), TRUE, world);
	if (((trace_fraction < 1) || (self.velocity_z > 40)))
	{
		self.thru = 0;
	}
	traceline(self.origin, (self.origin - (v_up * 128)), TRUE, world);
	if (((trace_fraction < 1) || (self.velocity_z < -40)))
	{
		self.thru = 4;
	}
	turn_hedrone(v0);
	if ((self.thru != oth))
	{
		self.fly_sound = time;
	}
	if (FindTarget())
	{
		self.think = hedrone_run;
		self.nextthink = (time + 0.1);
		return;
	}
	self.think = hedrone_stand;
	self.nextthink = (time + 0.1);
};

void() hedrone_walk =
{
	local vector v0;
	local vector v1;
	local vector v2;
	local vector v3;
	local float oth;

	oth = self.thru;
	if ((time > self.fly_sound))
	{
		sound(self, CHAN_BODY, "engines/chopper.wav", ((self.thru * 0.2) + 0.2), ATTN_NORM);
		self.fly_sound = (time + 1);
	}
	self.enemy = world;
	self.goalentity = self.movetarget;
	if (!self.goalentity)
	{
		turn_hedrone((self.angles_y * '0 1 0'));
		self.think = hedrone_stand;
		self.nextthink = (time + 0.1);
		return;
	}
	he_movetogoal();
	if ((self.thru != oth))
	{
		self.fly_sound = time;
	}
	if (FindTarget())
	{
		self.think = hedrone_run;
		self.nextthink = (time + 0.1);
		return;
	}
	self.think = hedrone_walk;
	self.nextthink = (time + 0.1);
};

void() hedrone_run =
{
	local vector v0;
	local vector v1;
	local vector v2;
	local vector v3;
	local float tmp;
	local float oth;

	oth = self.thru;
	if ((time > self.fly_sound))
	{
		sound(self, CHAN_BODY, "engines/chopper.wav", ((self.thru * 0.2) + 0.2), ATTN_NORM);
		self.fly_sound = (time + 1);
	}
	if (((self.goalentity.health < 1) || (self.goalentity.takedamage < 1)))
	{
		self.goalentity = world;
	}
	if ((!visible(self.goalentity) && (self.search_time < time)))
	{
		self.goalentity = world;
	}
	if (!self.goalentity)
	{
		turn_hedrone((self.angles_y * '0 1 0'));
		self.think = hedrone_walk;
		self.nextthink = (time + 0.1);
		return;
	}
	v1 = (self.goalentity.origin + ((self.goalentity.mins + self.goalentity.maxs) * 0.5));
	if ((self.attack_state == 0))
	{
		he_movetogoal();
		if ((self.lefty < 0))
		{
			if ((random() < 0.1))
			{
				tmp = random();
				if ((vlen((v1 - self.origin)) < 500))
				{
					if ((tmp < 0.6))
					{
						self.attack_state = 1;
					}
					else
					{
						self.attack_state = 2;
					}
				}
				else
				{
					if ((vlen((v1 - self.origin)) < 1000))
					{
						if ((tmp < 0.6))
						{
							self.attack_state = 2;
						}
						else
						{
							self.attack_state = 3;
						}
					}
					else
					{
						self.attack_state = 3;
					}
				}
			}
		}
	}
	else
	{
		if ((self.attack_state == 1))
		{
			v2 = (v1 + (self.goalentity.velocity * 0.000830));
		}
		else
		{
			if ((self.attack_state == 2))
			{
				v2 = (v1 + (self.goalentity.velocity * 0.001));
			}
			else
			{
				if ((self.attack_state == 3))
				{
					v2 = v1;
				}
			}
		}
		v0 = vectoangles((v2 - self.origin));
		if ((v0_x > 180))
		{
			v0_x = (v0_x - 360);
		}
		if ((v0_x > 45))
		{
			v0_x = 0;
			self.thru = 4;
		}
		if ((v0_x < -45))
		{
			v0_x = 0;
			self.thru = 0;
		}
		v3 = (self.angles_y * '0 1 0');
		makevectors(v3);
		v3 = (self.origin + (self.velocity * 0.5));
		traceline(self.origin, (v3 + (v_forward * 128)), FALSE, self);
		if ((trace_fraction < 1))
		{
			v0_x = 45;
			self.attack_state = 0;
		}
		traceline(self.origin, (v3 - (v_forward * 128)), FALSE, self);
		if ((trace_fraction < 1))
		{
			v0_x = -45;
			self.attack_state = 0;
		}
		traceline(self.origin, (v3 + (v_right * 128)), FALSE, self);
		if ((trace_fraction < 1))
		{
			v0_z = -45;
			self.attack_state = 0;
		}
		traceline(self.origin, (v3 - (v_right * 128)), FALSE, self);
		if ((trace_fraction < 1))
		{
			v0_z = 45;
			self.attack_state = 0;
		}
		traceline(self.origin, (v3 + (v_up * 128)), FALSE, self);
		if (((trace_fraction < 1) || (self.velocity_z > 40)))
		{
			self.thru = 0;
		}
		traceline(self.origin, (v3 - (v_up * 128)), FALSE, self);
		if (((trace_fraction < 1) || (self.velocity_z < -40)))
		{
			self.thru = 4;
		}
		turn_hedrone(v0);
		if ((self.attack_finished < time))
		{
			self.aiment = world;
			v2 = Drone_aim(0.96, 1500);
			v1 = self.angles;
			v1_x = (0 - v1_x);
			makevectors(v1);
			if ((self.aiment == self.enemy))
			{
				if ((self.attack_state == 1))
				{
					v3 = normalize((self.enemy.origin - self.origin));
					if (((v3 * v_forward) > 0.8))
					{
						AC_spike((self.origin + (v_forward * 10)), v3, self.enemy);
						self.attack_finished = (time + 0.2);
					}
				}
				else
				{
					if ((self.attack_state == 2))
					{
						AC_rocket(((self.origin + (v_right * 10)) + (v_forward * 10)), v_forward, self.enemy);
						AC_rocket(((self.origin - (v_right * 10)) + (v_forward * 10)), v_forward, self.enemy);
						self.attack_finished = (time + 1);
					}
					else
					{
						if ((self.attack_state == 3))
						{
							AC_heatseeker(((self.origin - (v_up * 10)) + (v_forward * 10)), v_forward, self.enemy);
							self.attack_finished = (time + 2);
						}
					}
				}
			}
		}
		if (!visible(self.enemy))
		{
			self.attack_state = 0;
		}
		if ((random() < 0.1))
		{
			self.attack_state = 0;
		}
	}
	if ((self.thru != oth))
	{
		self.fly_sound = time;
	}
	self.think = hedrone_run;
	self.nextthink = (time + 0.1);
};

void() hedrone_start =
{
	if (((deathmatch > 0) && ((self.team == 0) || (teamplay == 0))))
	{
		remove(self);
		return;
	}
	self.takedamage = DAMAGE_AIM;
	self.view_ofs = '0 0 1';
	self.flags = (self.flags | FL_MONSTER);
	if (self.target)
	{
		self.movetarget = find(world, targetname, self.target);
		self.goalentity = find(world, targetname, self.target);
		if (!self.movetarget)
		{
			dprint("Monster can't find target at ");
			dprint(vtos(self.origin));
			dprint("\n");
		}
		self.think = hedrone_walk;
	}
	else
	{
		self.think = hedrone_stand;
	}
	self.nextthink = (self.nextthink + (random() * 0.5));
};

void() monster_helo =
{
	if (!deathmatch)
	{
		total_monsters = (total_monsters + 1);
	}
	self.solid = SOLID_SLIDEBOX;
	self.movetype = MOVETYPE_FLY;
	setmodel(self, "progs/helo1.mdl");
	setsize(self, '-16 -16 -16', '16 16 16');
	self.view_ofs = '0 0 1';
	if (!self.health)
	{
		self.health = 200;
	}
	self.netname = "a Chopper";
	setup_teament();
	self.touch = T_hedroneTouch;
	self.th_die = hedrone_die;
	self.th_stand = hedrone_stand;
	self.th_walk = hedrone_walk;
	self.th_run = hedrone_run;
	self.think = hedrone_start;
	self.nextthink = ((time + 0.1) + (random() * 0.1));
};

// --- Pressure helos: daily raiders that drop from the sky over a pickup, --
//     circle it hunting the civilians (faction T0 vs the T1 civilians), and
//     turn on the PLAYER too when the player's stars are high or they fly
//     close (that gate is FindTarget's Stars_EnemyShouldEngage — it only
//     applies to the player, never to civilians, so they always menace the
//     rescue zone). Spawned at runtime by Pressure_SpawnWave (objectives.qc).

float PRESS_HELO_SKY_Z       = 3700;  // ABSOLUTE spawn altitude (open sky, just
                                      // below SKY_TOP_Z=4096); they fly down in
float PRESS_SPAWN_SPREAD     = 512;   // random XY scatter at spawn so a flight
                                      // doesn't appear stacked on one point
float PRESS_HELO_HEALTH       = 160;  // a bit softer than the slot helos (200)
float PRESS_RING_RADIUS       = 640;  // patrol ring radius around the pickup
float PRESS_RING_ALT          = 320;  // patrol altitude above the pickup ground
float PRESS_RING_N            = 6;     // waypoints in the ring (hexagon)
float PRESS_WP_REACH          = 200;  // distance to a waypoint that counts as reached
float PRESS_HOSTILE_RADIUS    = 500;  // attack the player within this range
float PRESS_FIRE_RANGE        = 1200; // max range to open fire on a target
float PRESS_FIRE_INTERVAL     = 0.15; // seconds between machine-gun bursts
float PRESS_SCAN_RADIUS       = 900;  // how far it looks for civilians to strafe
float PRESS_SPEED             = 360;  // patrol/cruise speed (u/s)

// pressure helo fields:
//   self.owner       = the info_pickup it guards (ring centre reference)
//   self.movetarget  = current patrol waypoint (press_waypoint in the ring)
//   self.enemy       = current attack target (civilian or player vehicle)
//   self.attack_finished = next time it may fire

// Nearest living, visible CIVILIAN within PRESS_SCAN_RADIUS (world if none).
// Civilians are always fair game — no star gate; they're the point of the raid.
entity() presshelo_find_civ =
{
	local entity e;
	local entity best;
	local float bestd;
	local float d;

	best = world;
	bestd = PRESS_SCAN_RADIUS;
	e = find(world, classname, "civilian");
	while (e)
	{
		if ((e.health > 0))
		{
			d = vlen((e.origin - self.origin));
			if ((d < bestd) && visible(e))
			{
				bestd = d;
				best = e;
			}
		}
		e = find(e, classname, "civilian");
	}
	return (best);
};

// The player's piloted vehicle if it's within PRESS_HOSTILE_RADIUS, else world.
// Proximity hostility: ignores stars entirely — get too close and you're a target.
entity() presshelo_find_near_player =
{
	local entity client;
	local entity veh;

	client = find(world, classname, "player");
	while (client != world)
	{
		veh = client.enemy;
		if ((veh != world) && (veh.owner == client) && (veh.health >= 1))
		{
			if ((vlen((veh.origin - self.origin)) <= PRESS_HOSTILE_RADIUS))
			{
				return (veh);
			}
		}
		client = find(client, classname, "player");
	}
	return (world);
};

// Fire the machine gun (AC_spike) at self.enemy if roughly facing it. AC_spike
// reads self.enemy for owner/sound, so it must be set before calling.
void() presshelo_fire =
{
	local vector v1;
	local vector dir;

	if (time < self.attack_finished) return;
	v1 = (self.enemy.origin + ((self.enemy.mins + self.enemy.maxs) * 0.5));
	dir = normalize((v1 - self.origin));
	makevectors(self.angles);
	if (((dir * v_forward) > 0.6))
	{
		AC_spike((self.origin + (v_forward * 12)), dir, self.enemy);
		self.attack_finished = (time + PRESS_FIRE_INTERVAL);
	}
};

// Per-tick pressure-helo brain:
//   1) target = nearby player (<500u) if any, else nearest civilian in range
//   2) if a target: steer toward it and strafe with the machine gun
//   3) else: fly the patrol ring (advance waypoint when reached)
void() presshelo_think =
{
	local entity tgt;
	local vector goalpos;
	local vector dir;
	local float d;

	self.nextthink = (time + 0.1);
	self.think = presshelo_think;

	if ((time > self.fly_sound))
	{
		sound(self, CHAN_BODY, "engines/chopper.wav", 0.6, ATTN_NORM);
		self.fly_sound = (time + 1);
	}

	// --- APPROACH phase (self.style == 0): the helo spawned over its base
	// (a bombing_launcher) and flies to the mission area before it starts the
	// patrol. No targeting/shooting yet — it's just transiting in. Once it's
	// near the pickup it owns, switch to patrol/attack (style = 1).
	if (self.style == 0)
	{
		self.enemy = world;
		goalpos = self.owner.origin;          // the pickup it's heading for
		goalpos_z = (goalpos_z + PRESS_RING_ALT);
		dir = (goalpos - self.origin);
		d = vlen(dir);
		if (d <= (PRESS_RING_RADIUS + PRESS_WP_REACH))
		{
			self.style = 1;                   // arrived → begin patrolling
		}
		else
		{
			dir = (dir * (1 / d));
			self.velocity = (dir * PRESS_SPEED);
			self.angles = vectoangles(dir);
			self.angles_x = 0;
			return;                           // don't target/fire while inbound
		}
	}

	// Target: player-in-range beats civilians.
	tgt = presshelo_find_near_player();
	if (tgt == world) { tgt = presshelo_find_civ(); }
	self.enemy = tgt;

	if (self.enemy != world)
	{
		goalpos = self.enemy.origin;   // close on the target
	}
	else
	{
		// Patrol: head for the current waypoint, advancing the ring when close.
		if (self.movetarget == world) { self.movetarget = self.owner; }
		if (vlen((self.movetarget.origin - self.origin)) <= PRESS_WP_REACH)
		{
			self.movetarget = self.movetarget.movetarget;
			if (self.movetarget == world) { self.movetarget = self.owner; }
		}
		goalpos = self.movetarget.origin;
	}

	// Steer toward goalpos at PRESS_SPEED; yaw the body to face travel.
	dir = (goalpos - self.origin);
	d = vlen(dir);
	if (d > 1)
	{
		dir = (dir * (1 / d));
		self.velocity = (dir * PRESS_SPEED);
		self.angles = vectoangles(dir);
		self.angles_x = 0;
	}

	// Fire if we have a target in range and are roughly facing it.
	if (self.enemy != world)
	{
		if (vlen((self.enemy.origin - self.origin)) <= PRESS_FIRE_RANGE)
		{
			presshelo_fire();
		}
	}
};

// Build (or reuse) the ring of PRESS_RING_N waypoints around `pk` at patrol
// altitude, linked in a loop (each .movetarget → next, last → first). Returns
// the first waypoint. The ring is CACHED on pk.aiment so repeated sends to the
// same pickup don't spawn duplicate waypoint rings (entity leak / bunching).
entity(entity pk) presshelo_build_ring =
{
	local entity first;
	local entity prev;
	local entity wp;
	local float i;
	local float ang;
	local vector c;

	// Reuse the cached ring if this pickup already has one.
	if ((pk.aiment != world) && (pk.aiment.classname == "press_waypoint"))
	{
		return (pk.aiment);
	}

	c = pk.origin;
	c_z = (c_z + PRESS_RING_ALT);

	first = world;
	prev = world;
	i = 0;
	while (i < PRESS_RING_N)
	{
		wp = spawn();
		wp.classname = "press_waypoint";
		wp.solid = SOLID_NOT;
		wp.movetype = MOVETYPE_NONE;
		ang = ((i / PRESS_RING_N) * 360);
		makevectors(ang * '0 1 0');
		setorigin(wp, c + (v_forward * PRESS_RING_RADIUS));
		if (first == world) { first = wp; }
		if (prev != world) { prev.movetarget = wp; }
		prev = wp;
		i = (i + 1);
	}
	if (prev != world) { prev.movetarget = first; }   // close the loop
	pk.aiment = first;                                // cache for reuse
	return (first);
};

// Nearest bombing_launcher to `pos` (world if none) — the raiders' "base":
// pressure helos spawn high above it and fly to the mission area before they
// patrol, so they read as launching from the artillery sites.
entity(vector pos) presshelo_find_base =
{
	local entity e;
	local entity best;
	local float bestd;
	local float d;

	best = world;
	bestd = 0;
	e = find(world, classname, "bombing_launcher");
	while (e)
	{
		d = vlen((e.origin - pos));
		if ((best == world) || (d < bestd)) { best = e; bestd = d; }
		e = find(e, classname, "bombing_launcher");
	}
	return (best);
};

// Spawn one pressure helo guarding `pk`, starting at waypoint `startwp` of the
// shared ring. It SPAWNS high over the nearest bombing_launcher (its base) and
// flies in to the mission area (APPROACH phase, style 0) before it begins the
// patrol. If the map has no launcher, it just drops in from the sky over the
// pickup instead.
entity(entity pk, entity startwp) spawn_pressure_helo =
{
	local entity m;
	local entity base;
	local vector org;

	m = spawn();
	// Spawn HIGH in the open sky, over the launcher's XY (so they read as
	// launching from the artillery site) but at an ABSOLUTE altitude near the
	// sky ceiling — up there it's open air, so they never spawn inside a
	// building/terrain and explode on contact. Z is absolute (not an offset
	// off the launcher), so a launcher's own height doesn't push it past the
	// ceiling. Then they fly down to the mission area (APPROACH phase).
	base = presshelo_find_base(pk.origin);
	if (base != world)
		org = base.origin;        // XY of the artillery site
	else
		org = pk.origin;          // fallback: over the pickup
	org_z = PRESS_HELO_SKY_Z;     // absolute high-sky altitude
	// Spread the spawn XY so a flight doesn't appear stacked on one point
	// (they'd touch each other / bunch up on the way in).
	org_x = (org_x + ((random() - 0.5) * 2 * PRESS_SPAWN_SPREAD));
	org_y = (org_y + ((random() - 0.5) * 2 * PRESS_SPAWN_SPREAD));

	// Safety: if even that point is somehow solid/sky, step down looking for
	// open air; give up (skip this helo) only if nothing within reach is clear.
	{
		local float tries;
		local float c;
		c = pointcontents(org);
		tries = 0;
		while (((c == CONTENT_SOLID) || (c == CONTENT_SKY)) && (tries < 24))
		{
			org_z = (org_z - 128);
			c = pointcontents(org);
			tries = (tries + 1);
		}
		if ((c == CONTENT_SOLID) || (c == CONTENT_SKY))
		{
			remove(m);
			return (world);   // no clear spot — skip this helo
		}
	}

	setorigin(m, org);
	m.style = 0;                  // APPROACH phase: fly to the mission area first
	m.angles = '0 0 0';
	m.classname = "press_helo";
	m.netname = "a Chopper";
	m.solid = SOLID_SLIDEBOX;
	m.movetype = MOVETYPE_FLY;
	setmodel(m, "progs/helo1.mdl");
	setsize(m, '-16 -16 -16', '16 16 16');
	m.view_ofs = '0 0 1';
	m.health = PRESS_HELO_HEALTH;
	m.max_health = m.health;
	m.takedamage = DAMAGE_AIM;
	m.flags = (m.flags | FL_MONSTER);
	m.team = 0;
	m.ts = T0;                  // enemy faction (keeps the reticle red)
	m.from_slot = 1;            // survive the day-start hand-placed purge
	m.owner = pk;               // ring centre reference
	m.movetarget = startwp;     // start patrolling from this waypoint
	m.touch = T_hedroneTouch;   // ramming damage, same as the normal helo
	m.th_die = hedrone_die;
	// CRITICAL: standard Quake AI (T_Damage → FoundTarget → HuntTarget) sets
	// self.think = self.th_run when this monster is hurt. Point th_run/th_walk/
	// th_stand at our own brain so that reassignment lands on presshelo_think
	// instead of NULL — otherwise the next frame crashes with "PR_ExecuteProgram:
	// NULL function". th_pain is harmless no-op (our think re-picks targets).
	m.th_run = presshelo_think;
	m.th_walk = presshelo_think;
	m.th_stand = presshelo_think;
	// (th_pain left unset: combat.qc guards it with `if (self.th_pain)`, so a
	// null pain handler is safe; only th_run was the crash, set above.)
	if (!deathmatch) { total_monsters = (total_monsters + 1); }
	m.think = presshelo_think;
	m.nextthink = (time + 0.1 + random() * 0.3);
	return (m);
};

// Drop a full flight of PRESS_HELOS_PER_SEND helos to patrol the pickup `pk`:
// build one shared ring and start each helo at a waypoint spread around the
// loop so they don't bunch up. Called per send from Pressure_SpawnWave.
float PRESS_HELOS_PER_SEND = 3;   // helos per send, all guarding ONE pickup

void(entity pk) spawn_pressure_flight =
{
	local entity ring;
	local entity wp;
	local float i;
	local float k;
	local float step;

	ring = presshelo_build_ring(pk);
	step = floor(PRESS_RING_N / PRESS_HELOS_PER_SEND);   // waypoints between starts
	if (step < 1) step = 1;

	wp = ring;
	i = 0;
	while (i < PRESS_HELOS_PER_SEND)
	{
		spawn_pressure_helo(pk, wp);
		// Advance the start waypoint `step` corners along the ring for the next.
		k = 0;
		while ((k < step) && (wp != world)) { wp = wp.movetarget; k = (k + 1); }
		if (wp == world) { wp = ring; }
		i = (i + 1);
	}
};
