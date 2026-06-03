//Decompiled code. Please respect the original copyright.
// CSQC HUD weapon ID (0-13), synced to client via stat 33
.float hud_wep_id;
float STAT_HUD_WEP = 33;
// CSQC compass heading, synced via stat 34
.float hud_yaw;
float STAT_HUD_YAW = 34;
// CSQC vehicle type: 0=none, 1=plane, 2=helo, 3=ground
.float hud_vtype;
float STAT_HUD_VTYPE = 35;
// CSQC missile view indicator
float STAT_HUD_MISSVIEW = 36;
// CSQC vehicle selection (self.style, 1-10)
float STAT_HUD_VSTYLE = 37;
// CSQC notoriety stars (0-5), GTA-style
float STAT_HUD_STARS = 38;
// CSQC scrap inventory (integer)
float STAT_HUD_SCRAP = 39;
// CSQC player score / credits
float STAT_HUD_CREDITS = 40;
// CSQC passenger count (0..PICKUP_CAPACITY)
float STAT_HUD_PAX = 41;
// CSQC active objective marker. Distance + dot products against player
// view (computed server-side because ironwail doesn't expose VF_ view
// properties to CSQC). dot_fwd > 0.5 = roughly on screen, dot_right
// sign = left/right.
float STAT_HUD_OBJ_DIST   = 42;
float STAT_HUD_OBJ_DOTFWD = 43;
float STAT_HUD_OBJ_DOTRGT = 44;
float STAT_HUD_OBJKIND    = 45;
// CSQC stealth state for the "DANGER" banner: 0=hidden, 1=visible (above
// stealth altitude but no radar lock), 2=visible+red (radar has lock).
float STAT_HUD_DANGER     = 46;
// Current day number (1..5). Drives difficulty escalation and the upgrade
// package chooser. Synced to CSQC so the HUD can show the day badge.
float STAT_HUD_DAY        = 47;
// Civilians left in the current day's wave (server-side count).
float STAT_HUD_WAVE_LEFT  = 48;
// Upgrade bitmask (see UPG_* constants below). Synced so HUD can show
// active perks.
float STAT_HUD_UPGRADES   = 49;
// Newscast del día: 0 = sin newscast; 1..5 = día cuyo titular se muestra.
// CSQC pinta el overlay BREAKING NEWS (canal de noticias 24h) cuando > 0.
float STAT_HUD_INTRO      = 50;
float EV_FLOAT = 2;
void(float num, float type, .__variant fld) clientstat = #232;

.float jetpack;
.float jetpack_charge;
.float toyview;
.float pdmg;
.float thru;
.float landed;
// Notoriety: 0..5 in fractional units (decays smoothly). Floor()'d for HUD.
.float stars;
// Next time star decay tick fires (server-side).
.float star_decay_next;
// Cooldown to prevent +stars spam from rapid-fire weapons.
.float star_shoot_cooldown;
// Next time the "high flight" star tick fires.
.float star_highflight_next;
// Scrap inventory: integer count. Each piece picked up adds 1. Healing
// consumes 1 per heal tick. Respawn snaps the count back to SCRAP_RESPAWN_COUNT.
.float scrap;
// Next time the passive heal tick fires (gates the rate, not the buff).
.float scrap_heal_next;
// Player score in credits (auto-donated, never spent). Increments from photos.
.float credits;
// Cooldown between successive camera snaps.
.float photo_finished;
// Monster: marks them as "war criminal" until this time (shot a weapon recently).
.float warcrime_until;
// Per-player HUD broadcast of the active objective (updated each PreThink).
// Computed server-side so the HUD just renders.
.float obj_dist;     // 2D distance to target
.float obj_dotfwd;   // dot(toTarget, viewForward) — >0.5 = on screen
.float obj_dotrgt;   // dot(toTarget, viewRight)  — sign = left/right
.float obj_kind;     // 0=pickup, 1=ship, -1=none
// CSQC DANGER banner state, broadcast every PreThink. See STAT_HUD_DANGER.
.float hud_danger;
// Set by monster_rad whenever it has lock on the player. CSQC reads this
// (indirectly via hud_danger) to colour the DANGER banner red. The 1.5s
// grace beyond the radar's own 1Hz tick avoids the banner flickering
// between locked/unlocked frames.
.float radar_locked_until;
// Per-frame cache for Stars_AltOverGround(). The function does a
// traceline + pointcontents check that several systems hit each frame
// (sigilo / radar visibility / DANGER banner / high-flight stars).
// Cached value is reused while ground_alt_cache_time == time.
.float ground_alt_cache;
.float ground_alt_cache_time;
// Bitmask of unlocked upgrades for the player. See UPG_* constants.
// Resets to 0 on PutClientInServer, accumulates as the player picks
// packages each day (upgrades.qc).
.float upgrades;
// Pending day-package choice. -1 = no pending choice; 0 = waiting for
// pick; set to the day number when a choice is offered.
.float upgrade_choice_pending;
// Hospital state. Per-entity capacity / ritmo.
.float hosp_pax;            // pasajeros actualmente alojados
.float hosp_cap;            // capacidad máxima
.float hosp_rate;           // segundos por paciente procesado
.float hosp_next_release;   // próximo time en el que se libera 1 plaza
.float hosp_kind;           // 0=barco, 1=hospital en tierra
.float hosp_destroyed;      // 1 si Goliath lo derribó este día
// CSQC mirror del newscast del día (0 = ninguno, 1..5 = día). Lo escribe
// el sistema de newscast en day.qc (News_Show / News_Tick).
.float hud_intro;
// Monstruo spawneado vía info_enemy_slot. World purge usa esto para
// borrar al inicio cualquier monstruo "colocado a mano" en el .map y
// dejar que el sistema de slots controle toda la población enemiga.
.float from_slot;
// Por-pickup: cuántos civiles ha generado en el día actual y cuántos
// puede generar como máximo (Day_WavePerPickup()).
.float pickup_spawned_day;
.float pickup_quota_day;
.float value;
.string ts;
.string oldts;
.float ammo_auto;
.float ammo_rock;
.float ammo_shel;
.float ammo_amsl;
.float ammo_smsl;
.float ammo_bomb;
.float ammo_cell;
.float ammo_mine;
.float wepv;
.float spawn_finished;
.float unstealth_finished;
.float missileview_on;
.float lives;
.float accesslvl;
.float accessparm;
.float twonumbers;
.float numcurspos;
.float gettingnum;
.entity tur1;
.entity tur2;
.entity radiuskiller;
.entity lastmiss;
float FALSE;
float TRUE    = 1;
float FL_FLY    = 1;
float FL_SWIM    = 2;
float FL_CLIENT    = 8;
float FL_INWATER    = 16;
float FL_MONSTER    = 32;
float FL_GODMODE    = 64;
float FL_NOTARGET    = 128;
float FL_ITEM    = 256;
float FL_ONGROUND    = 512;
float FL_PARTIALGROUND    = 1024;
float FL_WATERJUMP    = 2048;
float FL_JUMPRELEASED    = 4096;
float MOVETYPE_NONE;
float MOVETYPE_WALK    = 3;
float MOVETYPE_STEP    = 4;
float MOVETYPE_FLY    = 5;
float MOVETYPE_TOSS    = 6;
float MOVETYPE_PUSH    = 7;
float MOVETYPE_NOCLIP    = 8;
float MOVETYPE_FLYMISSILE    = 9;
float MOVETYPE_BOUNCE    = 10;
float MOVETYPE_BOUNCEMISSILE    = 11;
float SOLID_NOT;
float SOLID_TRIGGER    = 1;
float SOLID_BBOX    = 2;
float SOLID_SLIDEBOX    = 3;
float SOLID_BSP    = 4;
float RANGE_MELEE;
float RANGE_NEAR    = 1;
float RANGE_MID    = 2;
float RANGE_FAR    = 3;
float DEAD_NO;
float DEAD_DYING    = 1;
float DEAD_DEAD    = 2;
float DEAD_RESPAWNABLE    = 3;
float DAMAGE_NO;
float DAMAGE_YES    = 1;
float DAMAGE_AIM    = 2;
float IT_SHELLS    = 256;
float IT_NAILS    = 512;
float IT_ROCKETS    = 1024;
float IT_CELLS    = 2048;
float IT_ARMOR1    = 8192;
float IT_ARMOR2    = 16384;
float IT_ARMOR3    = 32768;
float IT_SUPERHEALTH    = 65536;
float IT_KEY1    = 131072;
float IT_KEY2    = 262144;
float IT_INVISIBILITY    = 524288;
float IT_INVULNERABILITY    = 1048576;
float IT_SUIT    = 2097152;
float IT_QUAD    = 4194304;
float IT_WEP1    = 1;
float IT_WEP2    = 2;
float IT_WEP3    = 4;
float IT_WEP4    = 8;
// Upgrade bitmask values (see .upgrades). Each day awards one package
// (A or B) that ORs in 1–2 of these flags. See upgrades.qc.
float UPG_FLARES                = 1;     // d2-A: flares anti-misil
float UPG_SCRAP_AUTO            = 2;     // d2-A pasiva: chatarra auto
float UPG_TURBO                 = 4;     // d2-B: turbo
float UPG_SIPHON_RANGE_PLUS     = 8;     // d2-B pasiva: sifón +alcance
float UPG_AUTOCANNON            = 16;    // d3-A: autocannon
float UPG_RESPAWN_FAST          = 32;    // d3-A pasiva: respawn rápido
float UPG_SIDEWINDERS           = 64;    // d3-B: sidewinders
float UPG_SIPHON_AMMO           = 128;   // d3-B pasiva: sifón munición
float UPG_HELLFIRES             = 256;   // d4-A: hellfires
float UPG_AMMO_INF_AUTOCANNON   = 512;   // d4-A pasiva: autocannon infinito
float UPG_ARMOR_15              = 1024;  // d4-B: blindaje x1.5
float UPG_SIPHON_RANGE_DOUBLE   = 2048;  // d4-B pasiva: sifón alcance x2
float UPG_ROCKETS               = 4096;  // d5-A: rockets de saturación
float UPG_AMMO_INF_ALL          = 8192;  // d5-A pasiva: munición infinita global
float UPG_RELOAD_FAST           = 16384; // d5-B: recarga acelerada
float UPG_ARMOR_2               = 32768; // d5-B pasiva: blindaje x2
float CONTENT_EMPTY    = -1;
float CONTENT_SOLID    = -2;
float CONTENT_WATER    = -3;
float CONTENT_SLIME    = -4;
float CONTENT_LAVA    = -5;
float CONTENT_SKY    = -6;
float STATE_TOP;
float STATE_BOTTOM    = 1;
float STATE_UP    = 2;
float STATE_DOWN    = 3;
vector VEC_ORIGIN;
vector VEC_HULL_MIN    = '-16 -16 -24';
vector VEC_HULL_MAX    = '16 16 32';
vector VEC_HULL2_MIN    = '-32 -32 -24';
vector VEC_HULL2_MAX    = '32 32 64';
float SVC_TEMPENTITY    = 23;
float SVC_KILLEDMONSTER    = 27;
float SVC_FOUNDSECRET    = 28;
float SVC_INTERMISSION    = 30;
float SVC_FINALE    = 31;
float SVC_CDTRACK    = 32;
float SVC_SELLSCREEN    = 33;
float TE_SPIKE;
float TE_SUPERSPIKE    = 1;
float TE_GUNSHOT    = 2;
float TE_EXPLOSION    = 3;
float TE_TAREXPLOSION    = 4;
float TE_LIGHTNING1    = 5;
float TE_LIGHTNING2    = 6;
float TE_WIZSPIKE    = 7;
float TE_KNIGHTSPIKE    = 8;
float TE_LIGHTNING3    = 9;
float TE_LAVASPLASH    = 10;
float TE_TELEPORT    = 11;
float CHAN_AUTO;
float CHAN_WEAPON    = 1;
float CHAN_VOICE    = 2;
float CHAN_ITEM    = 3;
float CHAN_BODY    = 4;
float ATTN_NONE;
float ATTN_NORM    = 1;
float ATTN_IDLE    = 2;
float ATTN_STATIC    = 3;
float UPDATE_GENERAL;
float UPDATE_STATIC    = 1;
float UPDATE_BINARY    = 2;
float UPDATE_TEMP    = 3;
float EF_BRIGHTFIELD    = 1;
float EF_MUZZLEFLASH    = 2;
float EF_BRIGHTLIGHT    = 4;
float EF_DIMLIGHT    = 8;
float MSG_BROADCAST;
float MSG_ONE    = 1;
float MSG_ALL    = 2;
float MSG_INIT    = 3;
float movedist;
float gameover;
string string_null;
float empty_float;
entity newmis;
entity activator;
entity damage_attacker;
float framecount;
float skill;
.string wad;
.string map;
.float worldtype;
.string killtarget;
.float light_lev;
.float style;
.void() th_stand;
.void() th_walk;
.void() th_run;
.void() th_missile;
.void() th_melee;
.void(entity attacker, float damage) th_pain;
.void() th_die;
.entity oldenemy;
.float speed;
.float lefty;
.float search_time;
.float attack_state;
float AS_STRAIGHT    = 1;
float AS_SLIDING    = 2;
float AS_MELEE    = 3;
float AS_MISSILE    = 4;
.float walkframe;
.float attack_finished;
.float pain_finished;
.float invincible_finished;
.float invisible_finished;
.float super_damage_finished;
.float radsuit_finished;
.float invincible_time;
.float invincible_sound;
.float invisible_time;
.float invisible_sound;
.float super_time;
.float super_sound;
.float rad_time;
.float fly_sound;
.float axhitme;
.float show_hostile;
.float jump_flag;
.float swim_flag;
.float air_finished;
.float bubble_count;
.float back_held;
.float dust_next;
.float ripple_next;
.float takeoff_until;
.string deathtype;
.string mdl;
.vector mangle;
.float mangle_x;
.float mangle_y;
.float mangle_z;
.float t_length;
.float t_width;
.vector dest;
.float dest_x;
.float dest_y;
.float dest_z;
.vector dest1;
.float dest1_x;
.float dest1_y;
.float dest1_z;
.vector dest2;
.float dest2_x;
.float dest2_y;
.float dest2_z;
.float wait;
.float delay;
.entity trigger_field;
.string noise4;
.float pausetime;
.entity movetarget;
.float aflag;
.float dmg;
.float cnt;
.void() think1;
.vector finaldest;
.float finaldest_x;
.float finaldest_y;
.float finaldest_z;
.vector finalangle;
.float finalangle_x;
.float finalangle_y;
.float finalangle_z;
.float count;
.float lip;
.float state;
.vector pos1;
.float pos1_x;
.float pos1_y;
.float pos1_z;
.vector pos2;
.float pos2_x;
.float pos2_y;
.float pos2_z;
.float height;
.float waitmin;
.float waitmax;
.float distance;
.float volume;
void (vector ang) makevectors = #1; 
void (entity e, vector o) setorigin = #2; 
void (entity e, string m) setmodel = #3; 
void (entity e, vector min, vector max) setsize = #4; 
void () break = #6; 
float () random = #7; 
void (entity e, float chan, string samp, float vol, float atten) sound = #8; 
vector (vector v) normalize = #9; 
void (string e) error = #10; 
void (string e) objerror = #11; 
float (vector v) vlen = #12; 
float (vector v) vectoyaw = #13; 
entity () spawn = #14; 
void (entity e) remove = #15; 
void (vector v1, vector v2, float nomonsters, entity forent) traceline = #16; 
entity () checkclient = #17; 
entity (entity start, .string fld, string match) find = #18; 
string (string s) precache_sound = #19; 
string (string s) precache_model = #20; 
void (entity client, string s) stuffcmd = #21; 
entity (vector org, float rad) findradius = #22; 
void (...) bprint = #23; 
void (...) sprint = #24; 
void (...) dprint = #25; 
string (float f) ftos = #26; 
string (vector v) vtos = #27; 
void () coredump = #28; 
void () traceon = #29; 
void () traceoff = #30; 
void (entity e) eprint = #31; 
float (float yaw, float dist) walkmove = #32; 
float () droptofloor = #34; 
void (float style, string value) lightstyle = #35; 
float (float v) rint = #36; 
float (float v) floor = #37; 
float (float v) ceil = #38; 
float (entity e) checkbottom = #40; 
float (vector v) pointcontents = #41; 
float (float f) fabs = #43; 
vector (entity e, float speed) aim = #44; 
float (string s) cvar = #45; 
void (string s) localcmd = #46; 
entity (entity e) nextent = #47; 
void (vector o, vector d, float color, float count) particle = #48; 
void () ChangeYaw = #49; 
vector (vector v) vectoangles = #51; 
void (float to, float f) WriteByte = #52; 
void (float to, float f) WriteChar = #53; 
void (float to, float f) WriteShort = #54; 
void (float to, float f) WriteLong = #55; 
void (float to, float f) WriteCoord = #56; 
void (float to, float f) WriteAngle = #57; 
void (float to, string s) WriteString = #58; 
void (float to, entity s) WriteEntity = #59; 
void (float step) movetogoal = #67; 
string (string s) precache_file = #68; 
void (entity e) makestatic = #69; 
void (string s) changelevel = #70; 
void (string var, string val) cvar_set = #72; 
void (entity client, string s, ...) centerprint = #73; 
void (vector pos, string samp, float vol, float atten) ambientsound = #74; 
string (string s) precache_model2 = #75; 
string (string s) precache_sound2 = #76; 
string (string s) precache_file2 = #77; 
void (entity e) setspawnparms = #78; 
