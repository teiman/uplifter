/*
 * fx_stubs.qc - Stubs for FX engine functions from air_experimental
 *
 * These functions originally relied on a custom engine (TQ/Telejano)
 * with extensions not available in Ironwail/standard Quake.
 * Declared empty so code that calls them compiles cleanly.
 * TODO: write Ironwail-compatible replacements using particles/sprites.
 *
 * Reference: ref/air_experimental/fx_engine.qc
 */

// --- FX type constants ---
float FX_FIRE           = 0;
float FX_BLUE           = 1;
float FX_RED            = 2;
float FX_SMOKE          = 3;
float FX_SPARK          = 4;
float FX_VORE           = 5;
float FX_WIZ            = 6;
float FX_GIB            = 7;
float FX_BOLT           = 8;
float FX_BIGFIRE         = 9;
float FX_SPARKSHOWER     = 10;
float FX_FIREBLUE        = 11;
float FX_FOGMAKER        = 12;
float FX_FOGMAKERLITE    = 12;
float FX_FOGENGINE       = 13;
float FX_ENGINE          = 14;
float FX_WATERFALL       = 15;
float FX_MAGIC           = 16;
float FX_AUTOSNOW        = 17;
float FX_TEMPUSVIVENDI   = 18;
float FX_TEMPUSFIRE      = 19;
float FX_TEMPUSSMOKE     = 20;
float FX_SHADOWSHIELD    = 21;
float FX_FLUXFIRE2       = 22;
float FX_MAGICFIRE       = 23;
float FX_DARKSMOKE       = 24;
float FX_DARKTRAIL       = 25;
float FX_DARKTRAIL2      = 26;
float FX_FLUXFIRESMALL   = 27;
float FX_CIRCLETRAIL     = 28;
float FX_FLARE           = 29;
float FX_BIGFLARE        = 30;
float FX_FLAREFIRE       = 30;
float FX_FLAREMINI       = 31;
float FX_MUZ             = 32;
float FX_GRAYBITS        = 33;
float FX_AUTOGUN         = 34;

// --- Entity fields used by FX system ---
.float scale;
.float alpha;
.vector colormod;

// --- MOVETYPE_FOLLOW (attach entity to .aiment) ---
float MOVETYPE_FOLLOW = 12; //unsupported 

// --- Stub functions ---
// All no-ops for now. Replace with Ironwail-compatible FX later.

entity(float fxt) SpawnFX =
{
	// TODO: spawn particle/sprite effect based on fxt type
	local entity ent = spawn();
	ent.nextthink = time + 0.1;
	ent.think = SUB_Remove;

	return ent;
};

void(float counter, entity ent, float FXT) InFxEnt =
{
	// TODO: attach a visual FX entity to ent
};

void(entity s) CopterSparks =
{
	// TODO: ground dust/spark effect under moving vehicles
};

void(vector org) HumoHere =
{
	// TODO: smoke puff at position
};

void() FX_Scorch =
{
	// TODO: scorch decal below self
};

void(vector org) FX_ScorchFinal =
{
	// TODO: scorch decal at org
};

void(vector pos, string decalname) PlaceDecal =
{
	// TODO: place decal sprite at pos
};

void(vector pos, string decalname) PlaceDecal2 =
{
	// TODO: place decal sprite at pos (silent variant)
};

void(vector pos, string decalname) PlaceDecalFinal =
{
	// TODO: place final decal at pos
};
