//Decompiled code. Please respect the original copyright.

// Ametralladora del jugador (WEP1):
//   - cada disparo gasta 1 de ammo_auto;
//   - al llegar a 0, tarda HE_AUTO_RELOAD segundos en recargarse a tope;
//   - una de cada HE_AUTO_TRACER_EVERY balas es trazadora (bala visible, como
//     la de los helos enemigos: AC_spike usa progs/bullet.mdl; AC_bullet no).
float HE_AUTO_MAX          = 100;  // capacidad del cargador
float HE_AUTO_RELOAD       = 3;    // segundos de recarga al vaciarse
float HE_AUTO_TRACER_EVERY = 5;    // 1 trazadora cada N balas

void() smoke_advance;
void() smoke_die;

void() smoke_die =
{
	remove(self);
};

void() smoke_advance =
{
	self.frame = (self.frame + 1);
	if ((self.frame >= 23))
	{
		self.think = smoke_die;
		self.nextthink = (time + 0.05);
		return;
	}
	self.velocity = (self.velocity * 0.92);
	self.think = smoke_advance;
	self.nextthink = (time + 0.05);
};

// Spawn a smoke volute at `where`, owned by `helo`. Starts mid-animation
// (frame 2) so it appears already puffy and is pushed radially outward from
// the helo from the very first tick — looks like dust kicked up by downwash.
void(entity helo, vector where) helo_spawn_dust =
{
	local entity e;
	local float pick;
	local vector dir;
	local float dist;

	e = spawn();
	pick = floor(random() * 5);
	if ((pick < 1))
	{
		setmodel(e, "progs/smoke.spr");
	}
	else
	{
		if ((pick < 2))
		{
			setmodel(e, "progs/smoke2.spr");
		}
		else
		{
			if ((pick < 3))
			{
				setmodel(e, "progs/smoke3.spr");
			}
			else
			{
				if ((pick < 4))
				{
					setmodel(e, "progs/smoke4.spr");
				}
				else
				{
					setmodel(e, "progs/smoke5.spr");
				}
			}
		}
	}
	setorigin(e, where);
	e.movetype = MOVETYPE_NOCLIP;
	e.solid = SOLID_NOT;
	e.classname = "helo_dust";
	e.owner = helo;
	e.frame = 2;

	// Initial velocity: small upward drift + small horizontal jitter.
	e.velocity_x = ((random() - 0.5) * 30);
	e.velocity_y = ((random() - 0.5) * 30);
	e.velocity_z = (10 + (random() * 10));

	// Radial push from the helo applied at spawn (downwash). Mostly horizontal.
	if (helo)
	{
		dir = (where - helo.origin);
		dir_z = (dir_z * 0.3);
		dist = vlen(dir);
		if ((dist < 96))
		{
			dir = normalize(dir);
			e.velocity = (e.velocity + (dir * (200 + (random() * 80))));
		}
	}

	e.think = smoke_advance;
	e.nextthink = (time + 0.05);
};

// Spawn a water ripple at `where` (which should sit on the water surface).
// No radial push — ripples expand on their own. Reuses smoke_advance to
// run through the 24 frames.
void(vector where) helo_spawn_ripple =
{
	local entity e;

	e = spawn();
	setmodel(e, "progs/ripple.spr");
	setorigin(e, where);
	e.movetype = MOVETYPE_NOCLIP;
	e.solid = SOLID_NOT;
	e.classname = "helo_ripple";
	e.frame = 0;
	e.velocity = '0 0 0';
	// SPR_ORIENTED: lay the sprite flat. Testing +90 again with the ripple
	// raised well above the water plane to rule out occlusion.
	e.angles = '90 0 0';
	e.think = smoke_advance;
	e.nextthink = (time + 0.05);
};

void() he1_currentammo =
{
	// WEP1=ametralladora  WEP2=hellfire  WEP3=flares
	self.ammo_shells  = self.ammo_auto;   // gun  → shells stat
	self.ammo_cells   = self.ammo_smsl;   // hell → cells stat
	self.ammo_rockets = self.ammo_amsl;   // flares → rockets stat
	if (self.weapon == IT_WEP1)
	{
		set_weaponmodel("progs/v_auto.mdl");   // hud_wep_id = 0
	}
	else if (self.weapon == IT_WEP2)
	{
		set_weaponmodel("progs/v_hell.mdl");   // hud_wep_id = 7
	}
	else  // WEP3 flares — sin modelo propio
	{
		set_weaponmodel("progs/v_hell.mdl");
		self.hud_wep_id = 20;                  // id especial para flares
	}
	self.hud_ammo2 = self.ammo_smsl;   // hellfire siempre al HUD
	self.hud_ammo3 = self.ammo_amsl;   // flares siempre al HUD
};

// Speed-feel: nube de particulas grises alrededor del heli, viajando
// en el frame del mundo opuestas (y mas rapidas) a la velocidad del
// heli — en el frame de la camara streakean hacia atras. Cuesta nada
// y vende mucho la sensacion de avance. Se llama cada frame desde
// he1_steer; bajo cierta velocidad minima se salta entera.
void(entity veh) heli_speedtrail =
{
	local float spd;
	local vector backward;
	local vector ofs;

	if (!veh)
		return;
	spd = vlen(veh.velocity);
	if ((spd < 80))
		return;

	// Spawn muy disperso: ~50% de los frames no aparece nada.
	if ((random() < 0.5))
		return;

	backward = (veh.velocity * -1.5);

	// Caja de spawn ~70% mas amplia que la version inicial
	// (220 -> 372 en XY, 120 -> 203 en Z).
	ofs_x = ((random() - 0.5) * 372);
	ofs_y = ((random() - 0.5) * 372);
	ofs_z = ((random() - 0.5) * 203);
	// color 4 = gris oscuro neutro; particle() anade variacion
	// interna asi que sale un rango de grises.
	particle((veh.origin + ofs), backward, 4, 1);
};

// ---------------------------------------------------------------------
// Heli "feel" experiment (more realistic helicopter vibes).
//   - Nose-down accelerates: thrust scales with how far the nose is
//     pitched down, building up to a top speed instead of a flat push.
//   - More inertia/drift: velocity is retained longer, so it lags behind
//     the nose and the heli skids when you turn at speed.
//   - A hard horizontal top speed so acceleration has a clear ceiling.
//   - Banking: rolls into turns proportional to speed.
//   - Flare: the nose lifts a touch when braking hard at speed.
// ---------------------------------------------------------------------
float HELI_DRIFT          = 0.925; // horizontal velocity retained per tick.
                                   // Decay per tick = 1-DRIFT; at 0.925 the
                                   // velocity bleeds half as fast as 0.85, so
                                   // momentum lasts ~2x longer (more inertia).
float HELI_THRUST_MIN     = 90;    // base forward push even with nose level
float HELI_THRUST_MAX     = 560;   // forward push at full nose-down (45 deg)
float HELI_TOP_SPEED      = 900;   // hard cap on horizontal speed (u/s)
float HELI_BRAKE_THRUST   = -260;  // reverse push from the explicit brake button
float HELI_BRAKE_THRUST_PITCH = 320; // reverse push at a fully-raised nose
                                   // (pitch-only braking: lift the nose to slow)
float HELI_BANK_PER_SPEED = 0.045; // roll deg per (u/s of sideways slip).
                                   // Tied to lateral drift, so the heli holds
                                   // its lean while the sideways momentum bleeds
                                   // off (longer with the higher inertia).
float HELI_BANK_MAX       = 32;    // cap on the drift-banking roll (deg)
float HELI_FLARE_DEG      = 18;    // nose-up flare when braking hard

void() he1_steer =
{
	local entity stemp;
	local entity stemp2;
	local vector v0;
	local vector v1;
	local vector v2;
	local vector v3;
	local float tmp;
	local float mov;
	local float back;

	stemp = self.enemy;

	// Regeneracion de flares: cooldown 3s tras el ultimo uso, luego 1/s hasta max 6
	if (self.flare_regen_time > 0 && self.ammo_amsl < 6 && time >= self.flare_regen_time)
	{
		self.ammo_amsl = self.ammo_amsl + 1;
		self.ammo_rockets = self.ammo_amsl;
		self.hud_ammo3 = self.ammo_amsl;
		self.flare_regen_time = (self.ammo_amsl < 6) ? (time + 1) : 0;
		W_SetCurrentAmmo();
	}

	heli_speedtrail(stemp);
	if ((time > self.fly_sound))
	{
		local float engVol;
		// Helo has 32 thrust levels; scale so engVol stays in [0.2, 1.0].
		engVol = ((stemp.thru * 0.025) + 0.2);
		if ((engVol > 1))
		{
			engVol = 1;
		}
		if (stemp.landed)
		{
			engVol = (engVol * 0.25);
		}
		sound(stemp, CHAN_BODY, "engines/chopper.wav", engVol, ATTN_NORM);
		self.fly_sound = (time + 1);
	}
	self.flags = (self.flags - (self.flags & FL_ONGROUND));
	stemp.flags = (stemp.flags - (stemp.flags & FL_ONGROUND));
	if ((pointcontents(stemp.origin) < CONTENT_EMPTY))
	{
		T_Damage(stemp, stemp, stemp, 1000);
	}
	mov = 0;
	if (self.button2)
	{
		mov = 1;
	}
	back = 0;
	if (self.back_held)
	{
		back = 1;
	}
	if ((stemp.angles_x < -180))
	{
		stemp.angles_x = (stemp.angles_x + 360);
	}
	if ((stemp.angles_x > 180))
	{
		stemp.angles_x = (stemp.angles_x - 360);
	}
	if (((stemp.health > 0) && !stemp.landed))
	{
		v0 = '0 0 0';
		v0_x = (0 - self.v_angle_x);
		if ((self.toyview == 4))
		{
			v0_x = 0;
		}
		if (mov)
		{
			v1 = self.v_angle;
			v2 = stemp.angles;
			v3 = (v1 - v2);
			v3_x = 0;
			v3_z = 0;
			makevectors(v3);
			tmp = v_forward_x;
			v0_x = (v0_x - (40 * tmp));
			tmp = v_forward_y;
			v0_z = (v0_z - (40 * tmp));
		}
		if (back)
		{
			// Flare: braking at speed lifts the nose up (negative pitch in
			// Quake), scaled by how fast we're going, like a real helicopter
			// flaring to bleed off speed. Slow/standing → no flare.
			local vector fvel;
			local float fspeed;
			local float flare;
			fvel = stemp.velocity;
			fvel_z = 0;
			fspeed = vlen(fvel);
			flare = (HELI_FLARE_DEG * (fspeed / HELI_TOP_SPEED));
			if ((flare > HELI_FLARE_DEG)) { flare = HELI_FLARE_DEG; }
			v0_x = (v0_x - flare);
		}
		if ((v0_x < -45))
		{
			v0_x = -45;
		}
		if ((v0_x > 45))
		{
			v0_x = 45;
		}
		if ((self.toyview == 0))
		{
			v0_y = self.v_angle_y;
		}
		else
		{
			if ((self.toyview == 1))
			{
				v0_y = anglemod((self.v_angle_y + 90));
			}
			else
			{
				if ((self.toyview == 2))
				{
					v0_y = anglemod((self.v_angle_y + 180));
				}
				else
				{
					if ((self.toyview == 3))
					{
						v0_y = anglemod((self.v_angle_y + 270));
					}
					else
					{
						if ((self.toyview == 4))
						{
							v0_y = stemp.angles_y;
						}
					}
				}
			}
		}
		v1 = '0 0 0';
		v1_y = anglemod((v0_y - stemp.angles_y));
		if ((v1_y > 180))
		{
			v1_y = (v1_y - 360);
		}
		v1_x = (v0_x - stemp.angles_x);
		v2 = '0 0 0';
		if ((v1_x < 0))
		{
			v2_x = -91;
		}
		if ((v1_x > 0))
		{
			v2_x = 91;
		}
		if ((fabs(v1_x) < (frametime * 91)))
		{
			v2_x = 0;
			stemp.angles_x = v0_x;
		}
		if ((v1_y < 0))
		{
			v2_y = -143;
		}
		if ((v1_y > 0))
		{
			v2_y = 143;
		}
		if ((fabs(v1_y) < (frametime * 143)))
		{
			v2_y = 0;
			stemp.angles_y = v0_y;
		}
		else
		{
			stemp.angles_y = anglemod(stemp.angles_y);
		}
		v0_z = (v0_z - ((v2_y * fabs(stemp.angles_x)) * 0.01));
		v0_z = (v0_z + (45 * self.lefty));
		// Banking: lean by how much the heli is SLIPPING sideways (its lateral
		// velocity relative to its own facing), not by the turn input. So the
		// roll follows the residual sideways momentum and stays leaned while
		// the drift bleeds off — the more inertia, the longer it holds the
		// bank. Project velocity onto the heli's right vector to get the slip.
		{
			local vector bvel;
			local vector bdir;
			local float slip;
			local float bank;
			bvel = stemp.velocity;
			bvel_z = 0;
			// Right vector from the heli's yaw (Quake: right = -sin(yaw),
			// cos(yaw) is forward; v_right points to the heli's right).
			makevectors([0, stemp.angles_y, 0]);
			bdir = v_right;
			slip = (bvel * bdir);            // sideways speed (signed)
			bank = (slip * HELI_BANK_PER_SPEED);
			if ((bank > HELI_BANK_MAX))  { bank = HELI_BANK_MAX; }
			if ((bank < (0 - HELI_BANK_MAX))) { bank = (0 - HELI_BANK_MAX); }
			v0_z = (v0_z - bank);
		}
		if ((v0_z < -45))
		{
			v0_z = -45;
		}
		if ((v0_z > 45))
		{
			v0_z = 45;
		}
		v1_z = (v0_z - stemp.angles_z);
		if ((v1_z < 0))
		{
			v2_z = -130;
			if ((v2_z < (v1_z * 10)))
			{
				v2_z = (v1_z * 10);
			}
		}
		if ((v1_z > 0))
		{
			v2_z = 130;
			if ((v2_z > (v1_z * 10)))
			{
				v2_z = (v1_z * 10);
			}
		}
		if ((fabs(v1_z) < (v2_z * frametime)))
		{
			v2_z = 0;
			stemp.angles_z = (0 - (v2_y * 0.3));
		}
		stemp.avelocity = v2;
	}
	if (stemp.landed)
	{
		if (((stemp.thru > 0) || (stemp.health < 1)))
		{
			stemp.landed = 0;
			stemp.groundentity = world;
		}
	}
	tmp = ((stemp.health * 100) / stemp.max_health);
	if ((tmp < 1))
	{
		tmp = 1;
	}
	if ((tmp < self.health))
	{
		self.dmg_take = (self.health - tmp);
	}
	self.health = tmp;
	if (stemp.landed)
	{
		if ((stemp.model != "progs/helo1c.mdl"))
		{
			setmodel(stemp, "progs/helo1c.mdl");
		}
	}
	else
	{
		if ((self.health < 20))
		{
			if ((stemp.model != "progs/helo1b.mdl"))
			{
				setmodel(stemp, "progs/helo1b.mdl");
			}
		}
		else
		{
			if ((stemp.model != "progs/helo1.mdl"))
			{
				setmodel(stemp, "progs/helo1.mdl");
			}
		}
	}
	if ((stemp.health < 1))
	{
		tmp = (random() * 50);
		self.dmg_take = (self.dmg_take + tmp);
		stemp.effects = 4;
	}
	else
	{
		stemp.effects = 0;
	}
	// Auto-level flight: target altitude is ABSOLUTE (relative to water Z=0),
	// not relative to the ground beneath. Each thru level fixes a cruise
	// altitude over the water plane: 64 units per step.
	//
	//   thru 0 → land slowly wherever you are (constant descent)
	//   thru 1..32 → WATER_Z + (64 * thru) + PAD
	local float thrLvl;
	local float targetAlt;
	local float wantVz;
	local float thrustH;
	local float dist1;
	local vector groundPos;
	local vector dustPos;
	local float WATER_Z;
	local float PAD;
	local float LAND_DESCENT;

	// Water surface Z is hardcoded by the editor: SEA_LEVEL_Z (0) minus
	// WATER_DROP (8) → -8. See modeditor/src/main/mapWriter.js.
	WATER_Z = -8;
	PAD = 0;
	LAND_DESCENT = 40;

	thrLvl = stemp.thru;
	if ((thrLvl > 32))
	{
		thrLvl = 32;
	}

	// One cheap traceline straight down: only used to spawn dust puffs when
	// the helo is hovering close to a surface. The flight model itself does
	// NOT use it.
	traceline(stemp.origin, (stemp.origin - '0 0 4096'), TRUE, stemp);
	dist1 = (stemp.origin_z - trace_endpos_z);
	groundPos = trace_endpos;

	// Downwash dust: alive helo flying low spawns volutes near the ground.
	if (((stemp.health > 0) && !stemp.landed))
	{
		if (((dist1 <= 65) && (time >= self.dust_next)))
		{
			dustPos = groundPos;
			dustPos_x = (dustPos_x + ((random() - 0.5) * 48));
			dustPos_y = (dustPos_y + ((random() - 0.5) * 48));
			dustPos_z = (dustPos_z + 25);
			helo_spawn_dust(stemp, dustPos);
			self.dust_next = (time + 0.03);
		}
	}

	// Water ripples: water surface is hardcoded at WATER_Z. Sample a point
	// 4u below that — if it's water, we're over the lake (not over an
	// emerged terrain cell). Spawn the ripple right on the water plane.
	if (((stemp.health > 0) && !stemp.landed && (time >= self.ripple_next)))
	{
		local vector probe;
		probe = stemp.origin;
		probe_z = (WATER_Z - 4);
		if ((pointcontents(probe) == CONTENT_WATER))
		{
			local vector waterPos;
			local float alt;
			alt = (stemp.origin_z - WATER_Z);
			if ((alt < 96))
			{
				waterPos = stemp.origin;
				// Coloca el ripple un poco sobre el plano del agua para que no
				// quede ocluido por la propia superficie.
				waterPos_z = (WATER_Z + 20);
				helo_spawn_ripple(waterPos);
				self.ripple_next = (time + 0.46);
			}
		}
	}

	if ((thrLvl <= 0))
	{
		// Land mode: ignore target altitude, just descend at a constant rate.
		// T_HETouch handles the actual landing snap on contact.
		wantVz = (0 - LAND_DESCENT);
	}
	else
	{
		targetAlt = WATER_Z + (64 * thrLvl) + PAD;
		// Dynamic floor: target altitude is never below "ground + 32" so the
		// helo doesn't descend into the terrain it's flying over. Stops the
		// landed/no-landed oscillation when the absolute target altitude
		// happens to match the ground height beneath the helo.
		if (((groundPos_z + 32) > targetAlt))
		{
			targetAlt = (groundPos_z + 32);
		}
		// Gain 3 + cap 400 lets the helo cover the extended 8-pip range
		// quickly enough that jumping several pips at once feels responsive.
		wantVz = ((targetAlt - stemp.origin_z) * 3);
		if ((wantVz > 400))
		{
			wantVz = 400;
		}
		if ((wantVz < -400))
		{
			wantVz = -400;
		}
		// Takeoff boost: if the helo is sitting on a surface higher than the
		// absolute target altitude, +1 pip alone would otherwise push it
		// downward — make sure it leaves the ground first.
		if ((dist1 < 24))
		{
			if ((wantVz < 120))
			{
				wantVz = 120;
			}
		}
	}

	// Horizontal thrust. We push along the nose's HORIZONTAL heading (v_forward
	// flattened to the XY plane and renormalised), NOT along the raw v_forward
	// — otherwise burying the nose makes v_forward point at the ground and the
	// push is wasted downward instead of moving us forward (the bug). With the
	// heading flattened, dipping the nose accelerates forward properly.
	v3 = stemp.angles;
	v3_x = (0 - v3_x);
	makevectors(v3);
	// Capture how far the nose is dipped from v_forward_z (geometric truth,
	// no guessing the sign of angles_x). The flight-forward v_forward points
	// down when the nose is buried, so a more-negative v_forward_z = more
	// nose-down. Then flatten v_forward to a horizontal heading for thrust.
	local float noseDip;
	{
		local vector fwdH;
		local float fl;
		noseDip = (0 - v_forward_z);     // 0 level .. ~1 fully nose-down
		fwdH = v_forward;
		fwdH_z = 0;
		fl = vlen(fwdH);
		if (fl > 0.001) { fwdH = (fwdH * (1 / fl)); }   // unit horizontal heading
		v_forward = fwdH;
	}
	// Pitch-driven thrust: the nose attitude itself sets the longitudinal push,
	// like a real helicopter. noseDip > 0 = nose buried (accelerate), < 0 =
	// nose raised (the rotor disc tilts back → it brakes), 0 = level (coast).
	//   - Holding accelerate (mov) with the nose down → full forward thrust
	//     scaled by how far it's buried (up to the cap).
	//   - RAISING THE NOSE brakes on its own: a nose-up attitude applies a
	//     reverse push proportional to how far it's pitched up, EVEN with no
	//     button held — so you slow down by flaring the nose up.
	//   - Holding brake (back) adds the strong explicit brake on top.
	{
		local float dip;       // +down .. -up, clamped to [-1, 1]
		dip = noseDip;
		if (dip < -1) { dip = -1; }
		if (dip > 1)  { dip = 1; }

		// SYMMETRIC pitch control: the nose attitude alone drives thrust, no
		// button needed either way.
		//   nose DOWN (dip > 0) → push FORWARD,  scaled by how far it's buried.
		//   nose UP   (dip < 0) → push BACKWARD (brake/reverse), scaled by tilt.
		//   level     (dip ~ 0) → coast.
		if (dip > 0)
		{
			thrustH = HELI_THRUST_MIN + (HELI_THRUST_MAX - HELI_THRUST_MIN) * dip;
		}
		else if (dip < 0)
		{
			thrustH = (0 - HELI_BRAKE_THRUST_PITCH) * (0 - dip);
		}
		else
		{
			thrustH = 0;
		}

		// Buttons stack ON TOP of the pitch: accelerate adds extra forward
		// thrust (a boost), brake adds the strong explicit reverse.
		if (mov)  { thrustH = thrustH + HELI_THRUST_MIN; }
		if (back) { thrustH = thrustH + HELI_BRAKE_THRUST; }
	}

	if ((time >= self.pausetime))
	{
		self.pausetime = (time + 0.1);
		if (!stemp.landed)
		{
			if (stemp.health < 1)
			{
				// Dead: free fall, no auto-level.
				stemp.velocity = ((stemp.velocity * 0.95) + ('0 0 -1' * 40));
			}
			else
			{
				local float strafeH;
				local float apply;
				local float hspeed;
				local vector hvel;
				strafeH = (self.lefty * 325);
				// Retain more velocity (HELI_DRIFT) so momentum lags behind
				// the nose → inertia and skidding. Apply the remaining
				// fraction as thrust so top speed stays bounded.
				apply = (1 - HELI_DRIFT);
				stemp.velocity_x = ((stemp.velocity_x * HELI_DRIFT) + (v_forward_x * thrustH * apply) + (v_right_x * strafeH * apply));
				stemp.velocity_y = ((stemp.velocity_y * HELI_DRIFT) + (v_forward_y * thrustH * apply) + (v_right_y * strafeH * apply));
				stemp.velocity_z = ((stemp.velocity_z * 0.5) + (wantVz * 0.5));

				// Hard horizontal top speed: clamp the XY velocity magnitude
				// so acceleration has a clear ceiling (Z is left alone).
				hvel = stemp.velocity;
				hvel_z = 0;
				hspeed = vlen(hvel);
				if ((hspeed > HELI_TOP_SPEED))
				{
					hvel = (hvel * (HELI_TOP_SPEED / hspeed));
					stemp.velocity_x = hvel_x;
					stemp.velocity_y = hvel_y;
				}

			}
			self.armorvalue = (vlen(stemp.velocity) / 3.3);
			self.hud_yaw = stemp.angles_y;
		}
		else
		{
			self.armorvalue = 0;
		}
	}
	if ((sky_z && (stemp.origin_z > sky_z)))
	{
		if ((stemp.velocity_z > 0))
		{
			stemp.origin_z = sky_z;
			stemp.velocity_z = 0;
			if ((stemp.angles_x > 0))
			{
				stemp.angles_x = 0;
			}
		}
	}
	Check_minsmaxs(stemp);
	if ((stemp.colormap != self.colormap))
	{
		stemp.colormap = self.colormap;
	}
	self.oldenemy.velocity = stemp.velocity;
	v2 = self.enemy.angles;
	v2_x = (0 - v2_x);
	makevectors(v2);
	v2 = v_forward;
	if (self.weapon == IT_WEP1)
	{
		v1 = AC_aim2(0.97, -500);
		if (((v2 * v1) < 0.7))
			v1 = AC_aim(0.97, -500);
	}
	else if (self.weapon == IT_WEP2)  // hellfire
	{
		v1 = AC_aim(0.93, 2000);
	}
	else  // WEP3 flares — sin sistema de punteria
	{
		v1 = AC_aim(1, -10);
	}
	if (!self.trigger_field)
	{
		return;
	}
	v1 = normalize(v1);
	traceline(stemp.origin, (stemp.origin + (v1 * 200)), FALSE, stemp);
	if ((self.enemy.trigger_field == world))
	{
		v2 = (stemp.origin + (v1 * ((trace_fraction * 200) - 8)));
		self.trigger_field.frame = 0;
	}
	else
	{
		v2 = place_targetbox();
	}
	setorigin(self.trigger_field, v2);
};

void() he1_attack =
{
	local vector v1;
	local vector v2;
	local entity stemp;

	v1 = self.enemy.angles;
	v1_x = (0 - v1_x);
	makevectors(v1);
	v1 = v_forward;
	self.enemy.trigger_field = world;
	if (self.weapon == IT_WEP1)  // ametralladora
	{
		// En recarga: si ya pasaron los 3s, rellena el cargador a tope; si no,
		// no se puede disparar todavía.
		if (self.auto_reload_time > 0)
		{
			if (time >= self.auto_reload_time)
			{
				self.ammo_auto = HE_AUTO_MAX;
				self.auto_reload_time = 0;
			}
			else
			{
				self.attack_finished = (time + 0.1);
				return;
			}
		}
		if (self.ammo_auto <= 0)
		{
			// Cargador vacío → arranca la recarga (a tope dentro de 3s).
			self.auto_reload_time = (time + HE_AUTO_RELOAD);
			self.attack_finished = (time + 0.1);
			return;
		}

		v2 = AC_aim(0.93, -1000);
		// Una de cada HE_AUTO_TRACER_EVERY balas es trazadora (AC_spike, bala
		// visible con modelo); el resto invisibles (AC_bullet).
		self.auto_shotcount = (self.auto_shotcount + 1);
		if ((self.auto_shotcount >= HE_AUTO_TRACER_EVERY))
		{
			self.auto_shotcount = 0;
			AC_spike(((self.enemy.origin + (v1 * 12)) + (v_right * 4)), v2, world);
		}
		else
		{
			AC_bullet(((self.enemy.origin + (v1 * 12)) + (v_right * 4)), v2, world);
		}
		self.ammo_auto = (self.ammo_auto - 1);
		self.enemy.effects = (self.enemy.effects | EF_MUZZLEFLASH);
		self.enemy.show_hostile = (time + 1);
		self.attack_finished = (time + 0.1);
	}
	else if (self.weapon == IT_WEP2)  // hellfire
	{
		if (self.ammo_smsl > 0)
		{
			v2 = AC_aim(0.93, 2000);
			AC_hellfire(((self.enemy.origin - (v_up * 10)) - (v1 * 10)), v1, self.enemy.trigger_field);
			self.enemy.effects = (self.enemy.effects | EF_MUZZLEFLASH);
			self.ammo_smsl = self.ammo_smsl - 1;
			self.ammo_cells = self.ammo_smsl;
			self.currentammo = self.ammo_smsl;
			self.hud_ammo2 = self.ammo_smsl;
			self.enemy.show_hostile = (time + 1);
		}
		else
		{
			sprint(self, "no hellfire ammo.\n");
		}
		self.attack_finished = (time + 2);
	}
	else  // WEP3 flares
	{
		if (self.ammo_amsl > 0)
		{
			AC_Flare();
			self.ammo_amsl = self.ammo_amsl - 1;
			self.ammo_rockets = self.ammo_amsl;
			self.currentammo = self.ammo_amsl;
			self.hud_ammo3 = self.ammo_amsl;
			self.flare_regen_time = time + 3;  // cooldown 3s antes de regenerar
		}
		else
		{
			sprint(self, "no flares.\n");
		}
		self.attack_finished = (time + 0.5);
	}
};

void() start_helo1 =
{
	local entity e;
	local entity e2;

	e = spawn();
	setmodel(e, "progs/helo1.mdl");
	e2 = self.goalentity;
	setorigin(e, e2.origin);
	e.angles = e2.angles;
	e.classname = "plane";
	e.velocity = '0 0 0';
	e.movetype = MOVETYPE_FLY;
	setsize(e, '-16 -16 -16', '16 16 16');
	e.solid = SOLID_SLIDEBOX;
	e.touch = T_HETouch;
	e.health = 200;
	e.max_health = e.health;
	e.takedamage = DAMAGE_AIM;
	e.th_die = HE_Die;
	e.netname = self.netname;
	e.thru = 2;
	self.enemy = e;
	e.goalentity = self;
	e.owner = self;
	self.toyview = 0;
	self.th_missile = he1_attack;
	self.th_run = he1_steer;
	self.th_melee = he1_currentammo;
	self.hud_vtype = 2;
	self.items = IT_WEP1 | IT_WEP2 | IT_WEP3;
	self.weapon = IT_WEP1;
	self.ammo_auto   = 100;  self.ammo_shells  = 100;  // ametralladora
	self.ammo_smsl   = (4 * wepmulti);  self.ammo_cells   = self.ammo_smsl;   // hellfire
	self.ammo_amsl   = 6;   self.ammo_rockets = 6;    // flares (fijo)
	Check_startlanded();
};
