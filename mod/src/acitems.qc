//Decompiled code. Please respect the original copyright.

float(entity e, float atype) check_ammo =
{
	if ((e.classname != "player"))
	{
		return (0);
	}
	if ((e.style == 1))
	{
		if (((atype == 1) && (e.ammo_auto < 200)))
		{
			return (40);
		}
		if (((atype == 2) && (e.ammo_rock < (10 * wepmulti))))
		{
			return (2);
		}
		if (((atype == 4) && (e.ammo_amsl < (4 * wepmulti))))
		{
			return (1);
		}
		if (((atype == 5) && (e.ammo_smsl < (4 * wepmulti))))
		{
			return (1);
		}
		if ((atype == 0))
		{
			if ((e.ammo_rock > (10 * wepmulti)))
			{
				e.ammo_rock = (10 * wepmulti);
			}
			if ((e.ammo_auto > 200))
			{
				e.ammo_auto = 200;
			}
			if ((e.ammo_amsl > (4 * wepmulti)))
			{
				e.ammo_amsl = (4 * wepmulti);
			}
			if ((e.ammo_smsl > (4 * wepmulti)))
			{
				e.ammo_smsl = (4 * wepmulti);
			}
		}
	}
	else
	{
		if ((e.style == 2))
		{
			if (((atype == 1) && (e.ammo_auto < 100)))
			{
				return (10);
			}
			if (((atype == 4) && (e.ammo_amsl < (4 * wepmulti))))
			{
				return (1);
			}
			if (((atype == 5) && (e.ammo_smsl < (4 * wepmulti))))
			{
				return (1);
			}
			if (((atype == 6) && (e.ammo_bomb < (4 * wepmulti))))
			{
				return (1);
			}
			if ((atype == 0))
			{
				if ((e.ammo_auto > 100))
				{
					e.ammo_auto = 100;
				}
				if ((e.ammo_amsl > (4 * wepmulti)))
				{
					e.ammo_amsl = (4 * wepmulti);
				}
				if ((e.ammo_smsl > (4 * wepmulti)))
				{
					e.ammo_smsl = (4 * wepmulti);
				}
				if ((e.ammo_bomb > (4 * wepmulti)))
				{
					e.ammo_bomb = (4 * wepmulti);
				}
			}
		}
		else
		{
			if ((e.style == 3))
			{
				if (((atype == 1) && (e.ammo_auto < 100)))
				{
					return (10);
				}
				if (((atype == 4) && (e.ammo_amsl < (4 * wepmulti))))
				{
					return (1);
				}
				if (((atype == 5) && (e.ammo_smsl < (4 * wepmulti))))
				{
					return (1);
				}
				if (((atype == 6) && (e.ammo_bomb < (4 * wepmulti))))
				{
					return (1);
				}
				if ((atype == 0))
				{
					if ((e.ammo_auto > 100))
					{
						e.ammo_auto = 100;
					}
					if ((e.ammo_amsl > (4 * wepmulti)))
					{
						e.ammo_amsl = (4 * wepmulti);
					}
					if ((e.ammo_smsl > (4 * wepmulti)))
					{
						e.ammo_smsl = (4 * wepmulti);
					}
					if ((e.ammo_bomb > (4 * wepmulti)))
					{
						e.ammo_bomb = (4 * wepmulti);
					}
				}
			}
			else
			{
				if ((e.style == 4))
				{
					if (((atype == 1) && (e.ammo_auto < 100)))
					{
						return (10);
					}
					if (((atype == 4) && (e.ammo_amsl < (2 * wepmulti))))
					{
						return (1);
					}
					if (((atype == 5) && (e.ammo_smsl < (6 * wepmulti))))
					{
						return (1);
					}
					if (((atype == 6) && (e.ammo_bomb < (6 * wepmulti))))
					{
						return (1);
					}
					if ((atype == 0))
					{
						if ((e.ammo_auto > 100))
						{
							e.ammo_auto = 100;
						}
						if ((e.ammo_amsl > (2 * wepmulti)))
						{
							e.ammo_amsl = (2 * wepmulti);
						}
						if ((e.ammo_smsl > (6 * wepmulti)))
						{
							e.ammo_smsl = (6 * wepmulti);
						}
						if ((e.ammo_bomb > (6 * wepmulti)))
						{
							e.ammo_bomb = (6 * wepmulti);
						}
					}
				}
				else
				{
					if ((e.style == 5))
					{
						if (((atype == 1) && (e.ammo_auto < 130)))
						{
							return (20);
						}
						if (((atype == 2) && (e.ammo_rock < (8 * wepmulti))))
						{
							return (2);
						}
						if (((atype == 4) && (e.ammo_amsl < (4 * wepmulti))))
						{
							return (1);
						}
						if (((atype == 7) && (e.ammo_cell < (40 * wepmulti))))
						{
							return (8);
						}
						if ((atype == 0))
						{
							if ((e.ammo_auto > 130))
							{
								e.ammo_auto = 130;
							}
							if ((e.ammo_rock > (8 * wepmulti)))
							{
								e.ammo_rock = (8 * wepmulti);
							}
							if ((e.ammo_amsl > (4 * wepmulti)))
							{
								e.ammo_amsl = (4 * wepmulti);
							}
							if ((e.ammo_cell > (40 * wepmulti)))
							{
								e.ammo_cell = (40 * wepmulti);
							}
						}
					}
					else
					{
						if ((e.style == 6))
						{
							if (((atype == 1) && (e.ammo_auto < 100)))
							{
								return (10);
							}
							if (((atype == 2) && (e.ammo_rock < (16 * wepmulti))))
							{
								return (4);
							}
							if (((atype == 4) && (e.ammo_amsl < (4 * wepmulti))))
							{
								return (1);
							}
							if (((atype == 5) && (e.ammo_smsl < (4 * wepmulti))))
							{
								return (1);
							}
							if ((atype == 0))
							{
								if ((e.ammo_rock > (16 * wepmulti)))
								{
									e.ammo_rock = (16 * wepmulti);
								}
								if ((e.ammo_auto > 100))
								{
									e.ammo_auto = 100;
								}
								if ((e.ammo_amsl > (4 * wepmulti)))
								{
									e.ammo_amsl = (4 * wepmulti);
								}
								if ((e.ammo_smsl > (4 * wepmulti)))
								{
									e.ammo_smsl = (4 * wepmulti);
								}
							}
						}
						else
						{
							if ((e.style == 7))
							{
								if (((atype == 1) && (e.ammo_auto < 200)))
								{
									return (40);
								}
								if (((atype == 4) && (e.ammo_amsl < (16 * wepmulti))))
								{
									return (4);
								}
								if ((atype == 0))
								{
									if ((e.ammo_auto > 200))
									{
										e.ammo_auto = 200;
									}
									if ((e.ammo_amsl > (16 * wepmulti)))
									{
										e.ammo_amsl = (16 * wepmulti);
									}
								}
							}
							else
							{
								if ((e.style == 8))
								{
									if (((atype == 1) && (e.ammo_auto < 150)))
									{
										return (20);
									}
									if (((atype == 3) && (e.ammo_shel < (60 * wepmulti))))
									{
										return (10);
									}
									if (((atype == 4) && (e.ammo_amsl < (6 * wepmulti))))
									{
										return (1);
									}
									if (((atype == 7) && (e.ammo_cell < (30 * wepmulti))))
									{
										return (5);
									}
									if ((atype == 0))
									{
										if ((e.ammo_shel > (60 * wepmulti)))
										{
											e.ammo_shel = (60 * wepmulti);
										}
										if ((e.ammo_auto > 150))
										{
											e.ammo_auto = 150;
										}
										if ((e.ammo_amsl > (6 * wepmulti)))
										{
											e.ammo_amsl = (6 * wepmulti);
										}
										if ((e.ammo_cell > (30 * wepmulti)))
										{
											e.ammo_cell = (30 * wepmulti);
										}
									}
								}
								else
								{
									if ((e.style == 9))
									{
										if (((atype == 1) && (e.ammo_auto < 150)))
										{
											return (20);
										}
										if (((atype == 4) && (e.ammo_amsl < (8 * wepmulti))))
										{
											return (2);
										}
										if (((atype == 6) && (e.ammo_bomb < (2 * wepmulti))))
										{
											return (1);
										}
										if (((atype == 8) && (e.ammo_mine < (6 * wepmulti))))
										{
											return (1);
										}
										if ((atype == 0))
										{
											if ((e.ammo_auto > 150))
											{
												e.ammo_auto = 150;
											}
											if ((e.ammo_amsl > (8 * wepmulti)))
											{
												e.ammo_amsl = (8 * wepmulti);
											}
											if ((e.ammo_bomb > (2 * wepmulti)))
											{
												e.ammo_bomb = (2 * wepmulti);
											}
											if ((e.ammo_mine > (6 * wepmulti)))
											{
												e.ammo_mine = (6 * wepmulti);
											}
										}
									}
									else
									{
										if ((e.style == 10))
										{
											if (((atype == 1) && (e.ammo_auto < 100)))
											{
												return (20);
											}
											if (((atype == 2) && (e.ammo_rock < (10 * wepmulti))))
											{
												return (2);
											}
											if (((atype == 5) && (e.ammo_smsl < (6 * wepmulti))))
											{
												return (1);
											}
											if (((atype == 7) && (e.ammo_cell < (40 * wepmulti))))
											{
												return (8);
											}
											if ((atype == 0))
											{
												if ((e.ammo_auto > 100))
												{
													e.ammo_auto = 100;
												}
												if ((e.ammo_rock > (10 * wepmulti)))
												{
													e.ammo_rock = (10 * wepmulti);
												}
												if ((e.ammo_smsl > (6 * wepmulti)))
												{
													e.ammo_smsl = (6 * wepmulti);
												}
												if ((e.ammo_cell > (40 * wepmulti)))
												{
													e.ammo_cell = (40 * wepmulti);
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
	return (0);
};

void() SUB_regen =
{
	self.model = self.mdl;
	self.solid = SOLID_TRIGGER;
	sound(self, CHAN_VOICE, "items/itembk2.wav", 1, ATTN_NORM);
	setorigin(self, self.origin);
};

void() ACPlaceItem =
{
	local float oldz;

	self.mdl = self.model;
	self.flags = FL_ITEM;
	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_FLY;
	self.velocity = '0 0 0';
};

void() ACStartItem =
{
	self.nextthink = (time + 0.2);
	self.think = ACPlaceItem;
};

void() ACammo_touch =
{
	local entity stemp;
	local entity pler;
	local float best;

	if ((other.owner.classname != "player"))
	{
		return;
	}
	if ((other.health <= 0))
	{
		return;
	}
	pler = other.goalentity;
	stemp = self;
	if (!check_ammo(pler, self.weapon))
	{
		return;
	}
	if ((self.weapon == 1))
	{
		pler.ammo_auto = (pler.ammo_auto + (self.aflag * wepmulti));
	}
	if ((self.weapon == 2))
	{
		pler.ammo_rock = (pler.ammo_rock + (self.aflag * wepmulti));
	}
	if ((self.weapon == 3))
	{
		pler.ammo_shel = (pler.ammo_shel + (self.aflag * wepmulti));
	}
	if ((self.weapon == 4))
	{
		pler.ammo_amsl = (pler.ammo_amsl + (self.aflag * wepmulti));
	}
	if ((self.weapon == 5))
	{
		pler.ammo_smsl = (pler.ammo_smsl + (self.aflag * wepmulti));
	}
	if ((self.weapon == 6))
	{
		pler.ammo_bomb = (pler.ammo_bomb + (self.aflag * wepmulti));
	}
	if ((self.weapon == 7))
	{
		pler.ammo_cell = (pler.ammo_cell + (self.aflag * wepmulti));
	}
	if ((self.weapon == 8))
	{
		pler.ammo_mine = (pler.ammo_mine + (self.aflag * wepmulti));
	}
	check_ammo(pler, 0);
	sprint(pler, "You got the ");
	sprint(pler, self.netname);
	sprint(pler, "\n");
	sound(other, CHAN_ITEM, "weapons/lock4.wav", 1, ATTN_NORM);
	stuffcmd(pler, "bf\n");
	stemp = self;
	self = pler;
	W_SetCurrentAmmo();
	self = stemp;
	self.model = string_null;
	self.solid = SOLID_NOT;
	if (deathmatch)
	{
		self.nextthink = (time + 30);
	}
	self.think = SUB_regen;
	activator = other;
	SUB_UseTargets();
};

void() item_spikes =
{
	self.touch = ACammo_touch;
	setmodel(self, "progs/box1.mdl");
	self.aflag = 50;
	self.skin = 0;
	self.weapon = 1;
	self.netname = "nails";
	setsize(self, '-16 -16 -16', '16 16 16');
	ACStartItem();
};

void() item_shells =
{
	self.touch = ACammo_touch;
	setmodel(self, "progs/box1.mdl");
	self.aflag = 8;
	self.skin = 2;
	self.weapon = 2;
	self.netname = "rockets";
	setsize(self, '-16 -16 -16', '16 16 16');
	ACStartItem();
};

void() item_canshells =
{
	self.touch = ACammo_touch;
	setmodel(self, "progs/box1.mdl");
	self.aflag = 20;
	self.skin = 5;
	self.weapon = 3;
	self.netname = "shells";
	setsize(self, '-16 -16 -16', '16 16 16');
	ACStartItem();
};

void() item_rockets =
{
	self.touch = ACammo_touch;
	setmodel(self, "progs/box1.mdl");
	self.aflag = 4;
	self.skin = 1;
	self.weapon = 4;
	self.netname = "missiles";
	setsize(self, '-16 -16 -16', '16 16 16');
	ACStartItem();
};

void() item_mavericks =
{
	self.touch = ACammo_touch;
	setmodel(self, "progs/imaver.mdl");
	self.aflag = 2;
	self.weapon = 5;
	self.netname = "AS missiles";
	setsize(self, '-16 -16 -16', '16 16 16');
	self.avelocity = '0 180 200';
	ACStartItem();
};

void() item_bombs =
{
	self.touch = ACammo_touch;
	setmodel(self, "progs/bomb.mdl");
	self.aflag = 2;
	self.skin = 0;
	self.weapon = 6;
	self.netname = "bombs";
	setsize(self, '-16 -16 -16', '16 16 16');
	self.avelocity = '0 180 200';
	ACStartItem();
};

void() item_cells =
{
	self.touch = ACammo_touch;
	setmodel(self, "progs/box1.mdl");
	self.aflag = 20;
	self.skin = 3;
	self.weapon = 7;
	self.netname = "cells";
	setsize(self, '-16 -16 -16', '16 16 16');
	ACStartItem();
};

void() item_mines =
{
	self.touch = ACammo_touch;
	setmodel(self, "progs/mine.mdl");
	self.aflag = 3;
	self.skin = 0;
	self.weapon = 8;
	self.netname = "mines";
	setsize(self, '-16 -16 -16', '16 16 16');
	self.avelocity = '100 100 100';
	ACStartItem();
};

void() health_touch =
{
	local float amount;
	local string s;

	if ((other.owner.classname != "player"))
	{
		return;
	}
	if ((other.owner.enemy != other))
	{
		return;
	}
	if ((other.health >= other.max_health))
	{
		return;
	}
	other.health = (other.health + floor((other.max_health * 0.25)));
	if ((other.health > other.max_health))
	{
		other.health = other.max_health;
	}
	sprint(other.owner, "You got the ");
	sprint(other.owner, self.netname);
	sprint(other.owner, "\n");
	sound(other, CHAN_ITEM, "items/health1.wav", 1, ATTN_NORM);
	stuffcmd(other.owner, "bf\n");
	self.model = string_null;
	self.solid = SOLID_NOT;
	if (deathmatch)
	{
		self.nextthink = (time + 20);
	}
	self.think = SUB_regen;
	activator = other;
	SUB_UseTargets();
};

void() item_health =
{
	self.touch = health_touch;
	// (items/health1.wav is precached in worldspawn — item_health can be spawned
	//  at runtime by drop_vehicle_loot, where precache_* would be a fatal error.)
	setmodel(self, "progs/box1.mdl");
	self.aflag = 25;
	self.skin = 4;
	self.netname = "health";
	setsize(self, '-16 -16 -16', '16 16 16');
	ACStartItem();
};

// Antes soltaba una caja de munición o salud al destruir un vehículo enemigo.
// Se ha desactivado a petición del usuario: ya no aparecen cajas al explotar
// vehículos. Dejamos la función como no-op (firma intacta) para no tocar las
// llamadas en drone_die / HE_Die / etank_die.
void(vector org) drop_vehicle_loot =
{
};

void() start_flagsoldier;

void() flagcollected_think =
{
	local float it1;

	if ((self.ts == T1))
	{
		it1 = IT_KEY1;
	}
	else
	{
		it1 = IT_KEY2;
	}
	if (!(self.enemy.items & it1))
	{
		if ((self.ts == T1))
		{
			bprint("Blue officer");
		}
		else
		{
			bprint("Red officer");
		}
		bprint(" has been returned to the base.\n");
		self.think = start_flagsoldier;
		self.nextthink = (time + 0.1);
		return;
	}
	self.think = flagcollected_think;
	self.nextthink = (time + 0.1);
};

void() flagsoldier_touch =
{
	local entity e;
	local float it1;
	local float it2;

	if ((other.health < 1))
	{
		return;
	}
	if ((other.owner.classname != "player"))
	{
		return;
	}
	if ((other.owner.enemy != other))
	{
		return;
	}
	if ((other.owner.style != 6))
	{
		if ((other.thru != 0))
		{
			return;
		}
		if (((other.speed != 0) && (other.velocity != '0 0 0')))
		{
			return;
		}
	}
	else
	{
		it1 = vlen(other.velocity);
		if ((it1 > 10))
		{
			return;
		}
	}
	e = other.owner;
	if ((self.ts == T1))
	{
		it1 = IT_KEY1;
		it2 = IT_KEY2;
	}
	else
	{
		it1 = IT_KEY2;
		it2 = IT_KEY1;
	}
	if ((other.ts == self.ts))
	{
		if ((e.items & it2))
		{
			bprint(e.netname);
			bprint(" made a capture!\n");
			givefrags(e, world, 5);
			giveteamfrags(e, 5);
			e.items = (e.items - it2);
		}
		return;
	}
	if ((e.items & it1))
	{
		return;
	}
	bprint(e.netname);
	bprint(" picked up ");
	if (!self.netname)
	{
		bprint("the enemy officer!\n");
	}
	else
	{
		bprint(self.netname);
		bprint("\n");
	}
	e.items = (e.items + it1);
	self.enemy = e;
	if ((self.value && !deathmatch))
	{
		killedvalues = (killedvalues + self.value);
	}
	setmodel(self, "");
	self.solid = SOLID_NOT;
	self.think = flagcollected_think;
	self.nextthink = (time + 0.1);
};

void() start_flagsoldier =
{
	if (deathmatch)
	{
		if (((teamplay == 0) || (self.team == 0)))
		{
			remove(self);
			return;
		}
		if ((self.team == 1))
		{
			self.ts = T1;
		}
		else
		{
			if ((self.team == 2))
			{
				self.ts = T2;
			}
		}
	}
	else
	{
		if ((self.team == 1))
		{
			self.ts = T1;
		}
		else
		{
			self.ts = T0;
		}
	}
	self.flags = FL_ITEM;
	setorigin(self, self.oldorigin);
	setmodel(self, "progs/player.mdl");
	setsize(self, '-16 -16 -1', '16 16 32');
	self.solid = SOLID_TRIGGER;
	self.movetype = MOVETYPE_TOSS;
	self.touch = flagsoldier_touch;
};

void() item_flagsoldier =
{
	self.oldorigin = self.origin;
	self.think = start_flagsoldier;
	self.nextthink = (time + 0.2);
};

void() item_model =
{
	setmodel(self, self.model);
};
