//Decompiled code. Please respect the original copyright.

void() Adminmenu =
{
	sprint(self, "Admin Commands:\n");
	sprint(self, "1: kick\n");
	sprint(self, "2: change map\n");
	sprint(self, "3: set timelimit\n");
	sprint(self, "4: set fraglimit\n");
	sprint(self, "5: set temp1\n");
	sprint(self, "9: exit menu\n");
};

void() CheckAdminCmd =
{
	local float n;
	local float n2;
	local entity p;
	local string st;

	if ((admin_p < 0))
	{
		return;
	}
	if ((self.impulse == 99))
	{
		if ((self.accesslvl == 4))
		{
			self.accesslvl = 3;
			bprint(self.netname);
			bprint(" has become a sysop\n");
			Adminmenu();
			self.accessparm = 0;
			self.gettingnum = 1;
			self.numcurspos = 1;
			self.twonumbers = 0;
			return;
		}
		else
		{
			if ((self.accesslvl < 3))
			{
				sprint(self, "Type your admin password (6 digits).\n");
				self.gettingnum = 1;
				self.twonumbers = 0;
				self.numcurspos = 6;
				self.accessparm = 0;
			}
		}
	}
	if (self.gettingnum)
	{
		if (((self.impulse > 0) && (self.impulse < 11)))
		{
			self.twonumbers = (self.twonumbers * 10);
			if ((self.impulse < 10))
			{
				self.twonumbers = (self.twonumbers + self.impulse);
			}
			self.impulse = 0;
			self.numcurspos = (self.numcurspos - 1);
			if ((self.numcurspos < 1))
			{
				self.gettingnum = 0;
				if ((self.twonumbers == admin_p))
				{
					self.accesslvl = 3;
					bprint(self.netname);
					bprint(" has become a sysop\n");
					Adminmenu();
					self.accessparm = 0;
					self.gettingnum = 1;
					self.numcurspos = 1;
					self.twonumbers = 0;
					return;
				}
			}
		}
	}
	if ((self.accesslvl != 3))
	{
		if (((self.impulse > 0) && (self.accesslvl < 3)))
		{
			self.accesslvl = 0;
		}
		self.accessparm = 0;
		return;
	}
	if (self.gettingnum)
	{
		return;
	}
	if ((self.accessparm == 0))
	{
		self.accessparm = self.twonumbers;
		self.twonumbers = 0;
		self.gettingnum = 1;
		if ((self.accessparm == 1))
		{
			sprint(self, "Kick (00 - 99):\n");
			p = find(world, classname, "player");
			n = 1;
			while ((p != world))
			{
				st = ftos(n);
				if ((n < 10))
				{
					sprint(self, " ");
				}
				sprint(self, st);
				sprint(self, " ");
				sprint(self, p.netname);
				sprint(self, "\n");
				p = find(p, classname, "player");
				n = (n + 1);
			}
			self.numcurspos = 2;
		}
		else
		{
			if ((self.accessparm == 2))
			{
				sprint(self, "Run map(00-99).cfg file.\n");
				self.numcurspos = 2;
			}
			else
			{
				if ((self.accessparm == 3))
				{
					sprint(self, "Set timelimit (00-99).\n");
					self.numcurspos = 2;
				}
				else
				{
					if ((self.accessparm == 4))
					{
						sprint(self, "Set fraglimit (000-999).\n");
						self.numcurspos = 3;
					}
					else
					{
						if ((self.accessparm == 5))
						{
							sprint(self, "Set temp1 (000-999).\n");
							self.numcurspos = 3;
						}
						else
						{
							if ((self.accessparm == 9))
							{
								sprint(self, "Goodbye. Press impulse 99 to get back to menu.\n");
								self.gettingnum = 0;
								self.numcurspos = 0;
								self.twonumbers = 0;
								self.accessparm = 0;
								self.accesslvl = 4;
							}
						}
					}
				}
			}
		}
		return;
	}
	if ((self.accessparm == 1))
	{
		n = (self.twonumbers - 1);
		p = find(world, classname, "player");
		while (((p != world) && (n > 0)))
		{
			p = find(p, classname, "player");
			n = (n - 1);
		}
		if ((p != world))
		{
			sprint(p, "\n\nYou have been kicked.\nGo abuse somewhere else.\n");
			stuffcmd(p, "disconnect\n");
			bprint(p.netname);
			bprint(" was kicked by ");
			bprint(self.netname);
			bprint("\n");
		}
		else
		{
			sprint(self, "Can't kick #");
			st = ftos(self.twonumbers);
			sprint(self, st);
			sprint(self, "\n");
		}
	}
	else
	{
		if ((self.accessparm == 2))
		{
			n2 = self.twonumbers;
			serverflags = ((serverflags - (serverflags & 255)) + n2);
			sprint(self, "running map cfg file..\n");
			if ((n2 >= cvar("noexit")))
			{
				n2 = 0;
			}
			localcmd("exec map");
			n = floor((n2 * 0.1));
			st = ftos(n);
			localcmd(st);
			n = (n2 - (n * 10));
			st = ftos(n);
			localcmd(st);
			localcmd(".cfg\n");
		}
		else
		{
			if ((self.accessparm == 3))
			{
				st = ftos(self.twonumbers);
				localcmd("timelimit ");
				localcmd(st);
				localcmd("\n");
				sprint(self, "Timelimit set\n");
			}
			else
			{
				if ((self.accessparm == 4))
				{
					st = ftos(self.twonumbers);
					localcmd("fraglimit ");
					localcmd(st);
					localcmd("\n");
					sprint(self, "Fraglimit set\n");
				}
				else
				{
					if ((self.accessparm == 5))
					{
						st = ftos(self.twonumbers);
						localcmd("temp1 ");
						localcmd(st);
						localcmd("\n");
						sprint(self, "Fraglimit changed.\n");
					}
				}
			}
		}
	}
	Adminmenu();
	self.twonumbers = 0;
	self.accessparm = 0;
	self.impulse = 0;
	return;
};
