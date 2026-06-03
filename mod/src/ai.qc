//Decompiled code. Please respect the original copyright.
void() movetarget_f;
void() t_movetarget;
float current_yaw;
entity sight_entity;
float sight_entity_time;

float(float v) anglemod =
{
	while ((v >= 360))
	{
		v = (v - 360);
	}
	while ((v < 0))
	{
		v = (v + 360);
	}
	return (v);
};

void() movetarget_f =
{
	if (!self.targetname)
	{
		remove(self);
		return;
	}
	self.goalentity = find(world, targetname, self.target);
	self.solid = SOLID_TRIGGER;
	self.touch = t_movetarget;
	setmodel(self, "progs/s_bubble.spr");
	setsize(self, '-8 -8 -8', '8 8 8');
};

void() path_corner =
{
	self.think = movetarget_f;
	self.nextthink = (time + 0.2);
};

void() t_movetarget =
{
	local entity temp;
	local float r;
	local float mr;
	local vector v1;
	local vector v2;

	if ((other.movetarget != self))
	{
		return;
	}
	if (((other.enemy != world) && (other.classname == "monster_drone2")))
	{
		v2 = normalize(((other.enemy.origin + ((other.enemy.mins + other.enemy.maxs) * 0.5)) - other.origin));
		temp = find(world, noise, other.noise);
		mr = 0;
		while (temp)
		{
			if ((temp.classname == "path_corner"))
			{
				v1 = normalize((temp.origin - other.origin));
				r = (v1 * v2);
				if ((r > mr))
				{
					if (visible(temp))
					{
						other.movetarget = temp;
						mr = r;
					}
				}
			}
			temp = find(temp, noise, other.noise);
		}
		other.trigger_field = self;
		return;
	}
	if ((other.movetype != MOVETYPE_STEP))
	{
		if ((other.enemy != world))
		{
			return;
		}
	}
	else
	{
		if (((other.enemy != world) && (other.enemy.classname == "tank")))
		{
			return;
		}
	}
	other.trigger_field = self;
	temp = self;
	self = other;
	other = temp;
	self.movetarget = find(world, targetname, other.target);
	self.goalentity = find(world, targetname, other.target);
	self.ideal_yaw = vectoyaw((self.goalentity.origin - self.origin));
	if (!self.movetarget)
	{
		self.pausetime = (time + 999999);
		self.th_stand();
		return;
	}
	self = temp;
};

float(entity targ) range =
{
	local vector spot1;
	local vector spot2;
	local float r;

	spot1 = (self.origin + self.view_ofs);
	spot2 = ((targ.origin + ((targ.mins + targ.maxs) * 0.5)) + targ.view_ofs);
	r = vlen((spot1 - spot2));
	if ((r < 250))
	{
		return (RANGE_MELEE);
	}
	if ((r < 500))
	{
		return (RANGE_NEAR);
	}
	if ((r < 1000))
	{
		return (RANGE_MID);
	}
	if ((r < 3000))
	{
		return (RANGE_FAR);
	}
	else
	{
		return (4);
	}
};

float(entity targ) visible =
{
	local vector spot1;
	local vector spot2;

	spot1 = (self.origin + self.view_ofs);
	spot2 = ((targ.origin + ((targ.mins + targ.maxs) * 0.5)) + targ.view_ofs);
	traceline(spot1, spot2, TRUE, self);
	if ((trace_inopen && trace_inwater))
	{
		return (FALSE);
	}
	if ((trace_ent == targ))
	{
		return (TRUE);
	}
	if ((trace_fraction == 1))
	{
		return (TRUE);
	}
	return (FALSE);
};

float(entity targ) infront =
{
	local vector vec;
	local float dot;

	makevectors(self.angles);
	vec = normalize((targ.origin - self.origin));
	dot = (vec * v_forward);
	if ((dot > 0.3))
	{
		return (TRUE);
	}
	return (FALSE);
};

void() HuntTarget =
{
	self.goalentity = self.enemy;
	self.think = self.th_run;
	self.ideal_yaw = vectoyaw((self.enemy.origin - self.origin));
	self.nextthink = (time + 0.1);
	SUB_AttackFinished(1);
};

void() SightSound =
{
	local float rsnd;

};

void() FoundTarget =
{
	if ((self.enemy.owner.classname == "player"))
	{
		sight_entity = self;
		sight_entity_time = time;
	}
	self.show_hostile = (time + 1);
	SightSound();
	HuntTarget();
};

float() FindTarget =
{
	local entity e;
	local entity client;
	local entity e2;
	local float r;
	local float mr;
	local vector org;
	local string teststr;

	if ((self.ts == T0))
	{
		teststr = T1;
	}
	else
	{
		if ((self.ts == T1))
		{
			if (deathmatch)
			{
				teststr = T2;
			}
			else
			{
				teststr = T0;
			}
		}
		else
		{
			teststr = T1;
		}
	}
	if (((sight_entity_time >= (time - 0.1)) && !(self.spawnflags & 1)))
	{
		client = sight_entity;
		if ((client.enemy == self.enemy))
		{
			return;
		}
		if ((client.ts == self.ts))
		{
			client = client.enemy;
		}
	}
	else
	{
		mr = 10000;
		if (self.enemy)
		{
			if (visible(self.enemy))
			{
				mr = vlen((self.enemy.origin - self.origin));
			}
		}
		client = world;
		e = checkcli(teststr);
		org = (e.origin + ((e.mins + e.maxs) * 0.5));
		r = vlen((org - self.origin));
		if ((r < mr))
		{
			if (visible(e))
			{
				client = e;
			}
		}
		if ((client == world))
		{
			return (FALSE);
		}
	}
	if ((client == self.enemy))
	{
		return (FALSE);
	}
	if ((client.owner.classname == "player"))
	{
		if ((client.owner.flags & FL_NOTARGET))
		{
			return (FALSE);
		}
		// Notoriety gating: low-star players are partially or fully invisible
		// to enemy acquisition. See Stars_EnemyShouldEngage for the policy.
		if (!Stars_EnemyShouldEngage(client.owner))
		{
			return (FALSE);
		}
	}
	if ((client.items & IT_INVISIBILITY))
	{
		return (FALSE);
	}
	r = range(client);
	if ((self.classname == "monster_rad"))
	{
		if (!infront(client))
		{
			return (FALSE);
		}
		if ((client.pdmg > (client.health * 1.5)))
		{
			return (FALSE);
		}
		if (((client.model == "progs/plane3.mdl") || (client.model == "progs/plane3b.mdl")))
		{
			if ((client.unstealth_finished < time))
			{
				return (FALSE);
			}
		}
		if ((r == 4))
		{
			return (FALSE);
		}
	}
	else
	{
		if ((r >= RANGE_FAR))
		{
			return (FALSE);
		}
		if (!visible(client))
		{
			return (FALSE);
		}
		if ((r == RANGE_NEAR))
		{
			if (((client.show_hostile < time) && !infront(client)))
			{
				return (FALSE);
			}
		}
		else
		{
			if ((r == RANGE_MID))
			{
				if (!infront(client))
				{
					return (FALSE);
				}
			}
		}
	}
	self.enemy = client;
	FoundTarget();
	return (TRUE);
};

void(float dist) ai_forward =
{
	walkmove(self.angles_y, dist);
};

void(float dist) ai_back =
{
	walkmove((self.angles_y + 180), dist);
};

void(float dist) ai_pain =
{
	ai_back(dist);
};

void(float dist) ai_painforward =
{
	walkmove(self.ideal_yaw, dist);
};

void(float dist) ai_walk =
{
	local vector mtemp;

	movedist = dist;
	if ((self.classname == "monster_dragon"))
	{
		movetogoal(dist);
		return;
	}
	if (FindTarget())
	{
		return;
	}
	movetogoal(dist);
};

void() ai_stand =
{
	if (FindTarget())
	{
		return;
	}
	if ((time > self.pausetime))
	{
		self.th_walk();
		return;
	}
};

void() ai_turn =
{
	if (FindTarget())
	{
		return;
	}
	ChangeYaw();
};

void(vector dest3) ChooseTurn =
{
	local vector dir;
	local vector newdir;

	dir = (self.origin - dest3);
	newdir_x = trace_plane_normal_y;
	newdir_y = (0 - trace_plane_normal_x);
	newdir_z = 0;
	if (((dir * newdir) > 0))
	{
		dir_x = (0 - trace_plane_normal_y);
		dir_y = trace_plane_normal_x;
	}
	else
	{
		dir_x = trace_plane_normal_y;
		dir_y = (0 - trace_plane_normal_x);
	}
	dir_z = 0;
	self.ideal_yaw = vectoyaw(dir);
};

float() FacingIdeal =
{
	local float delta;

	delta = anglemod((self.angles_y - self.ideal_yaw));
	if (((delta > 45) && (delta < 315)))
	{
		return (FALSE);
	}
	return (TRUE);
};

float() CheckAnyAttack =
{
	if (!enemy_vis)
	{
		return;
	}
	return (CheckAttack());
};

void() ai_run_melee =
{
	self.ideal_yaw = enemy_yaw;
	ChangeYaw();
	if (FacingIdeal())
	{
		self.th_melee();
		self.attack_state = AS_STRAIGHT;
	}
};

void() ai_run_missile =
{
	self.ideal_yaw = enemy_yaw;
	ChangeYaw();
	if (FacingIdeal())
	{
		self.th_missile();
		self.attack_state = AS_STRAIGHT;
	}
};

void() ai_run_slide =
{
	local float ofs;

	self.ideal_yaw = enemy_yaw;
	ChangeYaw();
	if (self.lefty)
	{
		ofs = 90;
	}
	else
	{
		ofs = -90;
	}
	if (walkmove((self.ideal_yaw + ofs), movedist))
	{
		return;
	}
	self.lefty = (1 - self.lefty);
	walkmove((self.ideal_yaw - ofs), movedist);
};

void(float dist) ai_run =
{
	local vector delta;
	local float axis;
	local float direct;
	local float ang_rint;
	local float ang_floor;
	local float ang_ceil;

	movedist = dist;
	if ((self.enemy.health <= 0))
	{
		self.enemy = world;
		if ((self.oldenemy.health > 0))
		{
			self.enemy = self.oldenemy;
			HuntTarget();
		}
		else
		{
			if (self.movetarget)
			{
				self.th_walk();
			}
			else
			{
				self.th_stand();
			}
			return;
		}
	}
	self.show_hostile = (time + 1);
	enemy_vis = visible(self.enemy);
	if (enemy_vis)
	{
		self.search_time = (time + 5);
	}
	if ((coop && (self.search_time < time)))
	{
		if (FindTarget())
		{
			return;
		}
	}
	enemy_infront = infront(self.enemy);
	enemy_range = range(self.enemy);
	enemy_yaw = vectoyaw((self.enemy.origin - self.origin));
	if ((self.attack_state == AS_MISSILE))
	{
		ai_run_missile();
		return;
	}
	if ((self.attack_state == AS_MELEE))
	{
		ai_run_melee();
		return;
	}
	if (CheckAnyAttack())
	{
		return;
	}
	if ((self.attack_state == AS_SLIDING))
	{
		ai_run_slide();
		return;
	}
	movetogoal(dist);
};
