//Decompiled code. Please respect the original copyright.
void() InitBodyQue;

void() main =
{
	dprint("main function\n");
	precache_file("progs.dat");
	precache_file("gfx.wad");
	precache_file("quake.rc");
	precache_file("default.cfg");
	precache_file("end1.bin");
	precache_file2("end2.bin");
	precache_file("demo1.dem");
	precache_file("demo2.dem");
	precache_file("demo3.dem");
	precache_file("gfx/palette.lmp");
	precache_file("gfx/colormap.lmp");
	precache_file2("gfx/pop.lmp");
	precache_file("gfx/complete.lmp");
	precache_file("gfx/inter.lmp");
	precache_file("gfx/ranking.lmp");
	precache_file("gfx/vidmodes.lmp");
	precache_file("gfx/finale.lmp");
	precache_file("gfx/conback.lmp");
	precache_file("gfx/qplaque.lmp");
	precache_file("gfx/menudot1.lmp");
	precache_file("gfx/menudot2.lmp");
	precache_file("gfx/menudot3.lmp");
	precache_file("gfx/menudot4.lmp");
	precache_file("gfx/menudot5.lmp");
	precache_file("gfx/menudot6.lmp");
	precache_file("gfx/menuplyr.lmp");
	precache_file("gfx/bigbox.lmp");
	precache_file("gfx/dim_modm.lmp");
	precache_file("gfx/dim_drct.lmp");
	precache_file("gfx/dim_ipx.lmp");
	precache_file("gfx/dim_tcp.lmp");
	precache_file("gfx/dim_mult.lmp");
	precache_file("gfx/mainmenu.lmp");
	precache_file("gfx/box_tl.lmp");
	precache_file("gfx/box_tm.lmp");
	precache_file("gfx/box_tr.lmp");
	precache_file("gfx/box_ml.lmp");
	precache_file("gfx/box_mm.lmp");
	precache_file("gfx/box_mm2.lmp");
	precache_file("gfx/box_mr.lmp");
	precache_file("gfx/box_bl.lmp");
	precache_file("gfx/box_bm.lmp");
	precache_file("gfx/box_br.lmp");
	precache_file("gfx/sp_menu.lmp");
	precache_file("gfx/ttl_sgl.lmp");
	precache_file("gfx/ttl_main.lmp");
	precache_file("gfx/ttl_cstm.lmp");
	precache_file("gfx/mp_menu.lmp");
	precache_file("gfx/netmen1.lmp");
	precache_file("gfx/netmen2.lmp");
	precache_file("gfx/netmen3.lmp");
	precache_file("gfx/netmen4.lmp");
	precache_file("gfx/netmen5.lmp");
	precache_file("gfx/sell.lmp");
	precache_file("gfx/help0.lmp");
	precache_file("gfx/help1.lmp");
	precache_file("gfx/help2.lmp");
	precache_file("gfx/help3.lmp");
	precache_file("gfx/help4.lmp");
	precache_file("gfx/help5.lmp");
	precache_file("gfx/pause.lmp");
	precache_file("gfx/loading.lmp");
	precache_file("gfx/p_option.lmp");
	precache_file("gfx/p_load.lmp");
	precache_file("gfx/p_save.lmp");
	precache_file("gfx/p_multi.lmp");
	precache_sound("misc/menu1.wav");
	precache_sound("misc/menu2.wav");
	precache_sound("misc/menu3.wav");
	precache_sound("ambience/water1.wav");
	precache_sound("ambience/wind2.wav");
	precache_file("maps/start.bsp");
	precache_file("maps/e1m1.bsp");
	precache_file("maps/e1m2.bsp");
	precache_file("maps/e1m3.bsp");
	precache_file("maps/e1m4.bsp");
	precache_file("maps/e1m5.bsp");
	precache_file("maps/e1m6.bsp");
	precache_file("maps/e1m7.bsp");
	precache_file("maps/e1m8.bsp");
	precache_file2("gfx/pop.lmp");
	precache_file2("maps/e2m1.bsp");
	precache_file2("maps/e2m2.bsp");
	precache_file2("maps/e2m3.bsp");
	precache_file2("maps/e2m4.bsp");
	precache_file2("maps/e2m5.bsp");
	precache_file2("maps/e2m6.bsp");
	precache_file2("maps/e2m7.bsp");
	precache_file2("maps/e3m1.bsp");
	precache_file2("maps/e3m2.bsp");
	precache_file2("maps/e3m3.bsp");
	precache_file2("maps/e3m4.bsp");
	precache_file2("maps/e3m5.bsp");
	precache_file2("maps/e3m6.bsp");
	precache_file2("maps/e3m7.bsp");
	precache_file2("maps/e4m1.bsp");
	precache_file2("maps/e4m2.bsp");
	precache_file2("maps/e4m3.bsp");
	precache_file2("maps/e4m4.bsp");
	precache_file2("maps/e4m5.bsp");
	precache_file2("maps/e4m6.bsp");
	precache_file2("maps/e4m7.bsp");
	precache_file2("maps/e4m8.bsp");
	precache_file2("maps/end.bsp");
	precache_file2("maps/dm1.bsp");
	precache_file2("maps/dm2.bsp");
	precache_file2("maps/dm3.bsp");
	precache_file2("maps/dm4.bsp");
	precache_file2("maps/dm5.bsp");
	precache_file2("maps/dm6.bsp");
};
entity lastspawn;

void() worldspawn =
{
	local float n;
	local string st;

	lastspawn = world;
	InitBodyQue();
	// Los monstruos del sistema info_enemy_slot pre-spawnean en su propio
	// constructor (info_enemy_slot, que es spawn function via el .bsp), así
	// que sus precache_model() se ejecutan en el momento correcto. No
	// hace falta precachear nada aquí en worldspawn.
	clientstat(STAT_HUD_WEP, EV_FLOAT, hud_wep_id);
	clientstat(STAT_HUD_YAW, EV_FLOAT, hud_yaw);
	clientstat(STAT_HUD_VTYPE, EV_FLOAT, hud_vtype);
	clientstat(STAT_HUD_MISSVIEW, EV_FLOAT, missileview_on);
	clientstat(STAT_HUD_VSTYLE, EV_FLOAT, style);
	clientstat(STAT_HUD_STARS, EV_FLOAT, stars);
	clientstat(STAT_HUD_SCRAP, EV_FLOAT, scrap);
	clientstat(STAT_HUD_CREDITS, EV_FLOAT, credits);
	clientstat(STAT_HUD_PAX, EV_FLOAT, pax);
	clientstat(STAT_HUD_OBJ_DIST,   EV_FLOAT, obj_dist);
	clientstat(STAT_HUD_OBJ_DOTFWD, EV_FLOAT, obj_dotfwd);
	clientstat(STAT_HUD_OBJ_DOTRGT, EV_FLOAT, obj_dotrgt);
	clientstat(STAT_HUD_OBJKIND,    EV_FLOAT, obj_kind);
	clientstat(STAT_HUD_DANGER,     EV_FLOAT, hud_danger);
	clientstat(STAT_HUD_MISSION,    EV_FLOAT, hud_mission);
	clientstat(STAT_HUD_DAY,        EV_FLOAT, hud_day);
	clientstat(STAT_HUD_UPGRADES,   EV_FLOAT, upgrades);
	clientstat(STAT_HUD_INTRO,      EV_FLOAT, hud_intro);
	if ((self.model == "maps/e1m8.bsp"))
	{
		cvar_set("sv_gravity", "100");
	}
	else
	{
		cvar_set("sv_gravity", "400");
	}
	cvar_set("sv_maxspeed", "400");
	cvar_set("sv_friction", "1");
	if ((serverflags < 256))
	{
		n = cvar("noexit");
		admin_p = n;
		n = (n & 255);
		st = ftos(n);
		cvar_set("noexit", st);
		admin_p = floor((admin_p / 256));
		serverflags = ((serverflags & 255) + (admin_p * 256));
	}
	admin_p = floor((serverflags / 256));
	if (!admin_p)
	{
		admin_p = -1;
	}
	T0 = "t0";
	T1 = "t1";
	T2 = "t2";
	W_Precache();
	News_Precache();   // voces del newscast del día (speech/news/dayN.wav)
	precache_sound("demon/dland2.wav");
	precache_sound("misc/h2ohit1.wav");
	precache_sound("items/itembk2.wav");
	precache_sound("player/land.wav");
	precache_sound("player/land2.wav");
	precache_sound("misc/talk.wav");
	precache_sound("player/teledth1.wav");
	precache_sound("misc/r_tele1.wav");
	precache_sound("misc/r_tele2.wav");
	precache_sound("misc/r_tele3.wav");
	precache_sound("misc/r_tele4.wav");
	precache_sound("misc/r_tele5.wav");
	precache_sound("weapons/lock4.wav");
	precache_sound("weapons/pkup.wav");
	precache_sound("items/armor1.wav");
	precache_sound("weapons/lhit.wav");
	precache_sound("weapons/lstart.wav");
	precache_sound("items/damage3.wav");
	precache_sound("misc/power.wav");
	precache_sound("player/gib.wav");
	precache_sound("player/udeath.wav");
	precache_sound("player/tornoff2.wav");
	precache_sound("player/pain1.wav");
	precache_sound("player/pain2.wav");
	precache_sound("player/pain3.wav");
	precache_sound("player/pain4.wav");
	precache_sound("player/pain5.wav");
	precache_sound("player/pain6.wav");
	precache_sound("player/death1.wav");
	precache_sound("player/death2.wav");
	precache_sound("player/death3.wav");
	precache_sound("player/death4.wav");
	precache_sound("player/death5.wav");
	precache_sound("player/h2ojump.wav");
	precache_sound("player/slimbrn2.wav");
	precache_sound("player/inh2o.wav");
	precache_sound("player/inlava.wav");
	precache_sound("misc/outwater.wav");
	precache_model("progs/player.mdl");
	precache_model("progs/eyes.mdl");
	precache_model("progs/h_player.mdl");
	precache_model("progs/gib1.mdl");
	precache_model("progs/gib2.mdl");
	precache_model("progs/gib3.mdl");
	precache_model("progs/s_bubble.spr");
	precache_model("progs/s_explod.spr");
	precache_model("progs/bolt.mdl");
	precache_model("progs/bolt2.mdl");
	precache_model("progs/bolt3.mdl");
	precache_model("progs/lavaball.mdl");
	precache_model("progs/zom_gib.mdl");
	precache_model2("progs/s_target.spr");
	precache_model2("progs/plane1.mdl");
	precache_model2("progs/plane1b.mdl");
	precache_model2("progs/plane2.mdl");
	precache_model2("progs/plane2b.mdl");
	precache_model2("progs/plane3.mdl");
	precache_model2("progs/plane3b.mdl");
	precache_model2("progs/plane4.mdl");
	precache_model2("progs/plane4b.mdl");
	precache_model2("progs/plane5.mdl");
	precache_model2("progs/plane5b.mdl");
	precache_model2("progs/helo1.mdl");
	precache_model2("progs/helo1b.mdl");
	precache_model2("progs/helo1c.mdl");
	precache_model2("progs/smoke.spr");
	precache_model2("progs/smoke2.spr");
	precache_model2("progs/smoke3.spr");
	precache_model2("progs/smoke4.spr");
	precache_model2("progs/smoke5.spr");
	precache_model2("progs/ripple.spr");
	precache_model2("progs/msamba.mdl");
	precache_model2("progs/msamtb.mdl");
	precache_model2("progs/tankba.mdl");
	precache_model2("progs/tanktr.mdl");
	precache_model2("progs/tanktb.mdl");
	precache_model2("progs/humba.mdl");
	precache_model2("progs/humtr.mdl");
	precache_model2("progs/humtb.mdl");
	precache_model2("progs/hovba.mdl");
	precache_model2("progs/hovtr.mdl");
	precache_model2("progs/p8walk.mdl");
	precache_model2("progs/p8head.mdl");
	precache_model2("progs/fx_void.mdl");
	precache_model2("progs/obus.mdl");
	precache_model("maps/b_cloud0.bsp");   // 5 cloud volumes (entidad cloud picks one at random)
	precache_model("maps/b_cloud1.bsp");
	precache_model("maps/b_cloud2.bsp");
	precache_model("maps/b_cloud3.bsp");
	precache_model("maps/b_cloud4.bsp");
	precache_sound2("claw.wav");
	precache_sound2("engines/engine.wav");
	precache_sound2("thump.wav");
	precache_sound2("beam_charge.wav");
	precache_model2("progs/hovtb.mdl");
	precache_model2("progs/rocket1.mdl");
	precache_model2("progs/rocket2.mdl");
	precache_model2("progs/sider.mdl");
	precache_model2("progs/amraam.mdl");
	precache_model2("progs/sting.mdl");
	precache_model2("progs/maver.mdl");
	precache_model2("progs/imaver.mdl");
	precache_model2("progs/hfire.mdl");
	precache_model2("progs/bomb.mdl");
	precache_model2("progs/pave.mdl");
	precache_model2("progs/mine.mdl");
	precache_model2("progs/rcbo.mdl");
	precache_model2("progs/bullet.mdl");
	precache_model2("progs/pbullet.mdl");
	precache_model2("progs/s_plasma.spr");
	precache_model2("progs/null.spr");
	precache_model2("progs/laser.mdl");
	precache_model2("progs/box1.mdl");
	precache_model2("progs/v_sider.mdl");
	precache_model2("progs/v_sting.mdl");
	precache_model2("progs/v_maver.mdl");
	precache_model2("progs/v_bomb.mdl");
	precache_model2("progs/v_mine.mdl");
	precache_model2("progs/v_sam.mdl");
	precache_model2("progs/v_plas.mdl");
	precache_model2("progs/v_auto.mdl");
	precache_model2("progs/v_cann.mdl");
	precache_model2("progs/v_rock.mdl");
	precache_model2("progs/v_hell.mdl");
	precache_model2("progs/v_rcbo.mdl");
	precache_model2("progs/v_pave.mdl");
	precache_model2("progs/v_amra.mdl");
	precache_sound2("enforcer/enfire.wav");
	precache_sound2("enforcer/enfstop.wav");
	precache_sound2("dsfirxpl.wav");
	precache_sound2("dsplasma.wav");
	precache_sound2("autocann.wav");
	precache_sound2("rocklnch.wav");
	precache_sound2("touchdwn.wav");
	precache_sound2("in1.wav");
	precache_sound2("in2.wav");
	precache_sound2("engines/chopper.wav");
	precache_sound2("engines/tank0.wav");
	precache_sound2("engines/tank1.wav");
	precache_sound2("engines/tank2.wav");
	precache_sound2("engines/tank3.wav");
	precache_sound2("engines/tank4.wav");
	precache_sound2("engines/tank5.wav");
	precache_sound2("engines/tank6.wav");
	precache_sound2("engines/tank7.wav");
	precache_sound2("engines/tank8.wav");
	precache_sound2("engines/car0.wav");
	precache_sound2("engines/car1.wav");
	precache_sound2("engines/car2.wav");
	precache_sound2("engines/car3.wav");
	precache_sound2("engines/car4.wav");
	precache_sound2("engines/car5.wav");
	precache_sound2("engines/car6.wav");
	precache_sound2("engines/car7.wav");
	precache_sound2("engines/car8.wav");
	precache_sound2("engines/hov0.wav");
	precache_sound2("engines/hov1.wav");
	precache_sound2("engines/hov2.wav");
	precache_sound2("engines/hov3.wav");
	precache_sound2("engines/hov4.wav");
	precache_sound2("engines/hov5.wav");
	precache_sound2("engines/hov6.wav");
	precache_sound2("engines/hov7.wav");
	precache_sound2("engines/hov8.wav");
	precache_sound2("engines/jet0.wav");
	precache_sound2("engines/jet1.wav");
	precache_sound2("engines/jet2.wav");
	precache_sound2("engines/jet3.wav");
	precache_sound2("engines/jet4.wav");
	precache_sound2("engines/jet5.wav");
	precache_sound2("engines/jet6.wav");
	precache_sound2("engines/jet7.wav");
	precache_sound2("engines/jet8.wav");
	precache_sound2("speech/f2_a.wav");
	precache_sound2("speech/f2_b.wav");
	precache_sound2("speech/f2_c.wav");
	precache_sound2("speech/f2_d.wav");
	precache_sound2("speech/f2_e.wav");
	precache_sound2("speech/f2_f.wav");
	precache_sound2("speech/f2_g.wav");
	precache_sound2("speech/f3_a.wav");
	precache_sound2("speech/f3_b.wav");
	precache_sound2("speech/f3_c.wav");
	precache_sound2("speech/f3_d.wav");
	precache_sound2("speech/f3_e.wav");
	precache_sound2("speech/f3_f.wav");
	precache_sound2("speech/f3_g.wav");
	precache_sound2("speech/f4_a.wav");
	precache_sound2("speech/f4_b.wav");
	precache_sound2("speech/f4_c.wav");
	precache_sound2("speech/f4_d.wav");
	precache_sound2("speech/f4_e.wav");
	precache_sound2("speech/f4_f.wav");
	precache_sound2("speech/f4_g.wav");
	precache_sound2("speech/f5_a.wav");
	precache_sound2("speech/f5_b.wav");
	precache_sound2("speech/f5_c.wav");
	precache_sound2("speech/f5_d.wav");
	precache_sound2("speech/f5_e.wav");
	precache_sound2("speech/f5_f.wav");
	precache_sound2("speech/f5_g.wav");
	precache_sound2("speech/f6_a.wav");
	precache_sound2("speech/f6_b.wav");
	precache_sound2("speech/f6_c.wav");
	precache_sound2("speech/f6_d.wav");
	precache_sound2("speech/f6_e.wav");
	precache_sound2("speech/f6_f.wav");
	precache_sound2("speech/f6_g.wav");
	precache_sound2("speech/f7_a.wav");
	precache_sound2("speech/f7_b.wav");
	precache_sound2("speech/f7_c.wav");
	precache_sound2("speech/f7_d.wav");
	precache_sound2("speech/f7_e.wav");
	precache_sound2("speech/f7_f.wav");
	precache_sound2("speech/f7_g.wav");
	precache_sound2("speech/f8_a.wav");
	precache_sound2("speech/f8_b.wav");
	precache_sound2("speech/f8_c.wav");
	precache_sound2("speech/f8_d.wav");
	precache_sound2("speech/f8_e.wav");
	precache_sound2("speech/f8_f.wav");
	precache_sound2("speech/fc_1.wav");
	precache_sound2("speech/fc_2.wav");
	precache_sound2("speech/fc_3.wav");
	precache_sound2("speech/fc_4.wav");
	precache_sound2("speech/mc_1.wav");
	precache_sound2("speech/mc_2.wav");
	precache_sound2("speech/mc_3.wav");
	precache_sound2("speech/mc_4.wav");
	precache_sound2("speech/mc_5.wav");
	precache_sound2("speech/mc_6.wav");
	precache_sound2("speech/mc_7.wav");
	precache_sound2("speech/rw_a_al.wav");
	precache_sound2("speech/rw_a_al2.wav");
	lightstyle(0, "m");
	lightstyle(1, "mmnmmommommnonmmonqnmmo");
	lightstyle(2, "abcdefghijklmnopqrstuvwxyzyxwvutsrqponmlkjihgfedcba");
	lightstyle(3, "mmmmmaaaaammmmmaaaaaabcdefgabcdefg");
	lightstyle(4, "mamamamamama");
	lightstyle(5, "jklmnopqrstuvwxyzyxwvutsrqponmlkj");
	lightstyle(6, "nmonqnmomnmomomno");
	lightstyle(7, "mmmaaaabcdefgmmmmaaaammmaamm");
	lightstyle(8, "mmmaaammmaaammmabcdefaaaammmmabcdefmmmaaaa");
	lightstyle(9, "aaaaaaaazzzzzzzz");
	lightstyle(10, "mmamammmmammamamaaamammma");
	lightstyle(11, "abcdefghijklmnopqrrqponmlkjihgfedcba");
	lightstyle(63, "a");

	// Cámara persistente del minimap. Se crea ahora (worldspawn permite
	// setmodel + setorigin sin restricciones) y vive para toda la
	// partida.  El handle g_minimap_cam queda estable, evitando race
	// conditions con Create_chasecam al hacer peek con M.
	Minimap_InitCam();
};

float g_objectives_inited;

void() StartFrame =
{
	if (!g_objectives_inited)
	{
		objectives_init();
		g_objectives_inited = 1;
	}
	Day_Tick();
	teamplay = cvar("teamplay");
	skill = cvar("skill");
	temp1 = cvar("temp1");
	if ((((temp1 & 1) == 1) && (deathmatch > 0)))
	{
		wepmulti = 2;
	}
	else
	{
		wepmulti = 1;
	}
	framecount = (framecount + 1);
	if ((time > cctime))
	{
		change_cc(T0);
		change_cc(T1);
		change_cc(T2);
		cctime = (time + 0.1);
	}
};
entity bodyque_head;

void() bodyque =
{
};

void() InitBodyQue =
{
	local entity e;

	bodyque_head = spawn();
	bodyque_head.classname = "bodyque";
	bodyque_head.owner = spawn();
	bodyque_head.owner.classname = "bodyque";
	bodyque_head.owner.owner = spawn();
	bodyque_head.owner.owner.classname = "bodyque";
	bodyque_head.owner.owner.owner = spawn();
	bodyque_head.owner.owner.owner.classname = "bodyque";
	bodyque_head.owner.owner.owner.owner = bodyque_head;
};

void(entity ent) CopyToBodyQue =
{
	bodyque_head.angles = ent.angles;
	bodyque_head.model = ent.model;
	bodyque_head.modelindex = ent.modelindex;
	bodyque_head.frame = ent.frame;
	bodyque_head.colormap = ent.colormap;
	bodyque_head.movetype = ent.movetype;
	bodyque_head.velocity = ent.velocity;
	bodyque_head.flags = 0;
	setorigin(bodyque_head, ent.origin);
	setsize(bodyque_head, ent.mins, ent.maxs);
	bodyque_head = bodyque_head.owner;
};
