'use client';

/**
 * Dwarven Forge Scene — chibi/cartoon SVG dwarves working the mountain forge.
 * Chunky, recognizable LOTR-style dwarves: big heads, big beards, horned helmets, stocky bodies.
 */

interface DwarfForgeSceneProps {
  variant: 'sidebar' | 'idle' | 'working' | 'complete';
  className?: string;
}

export function DwarfForgeScene({ variant, className = '' }: DwarfForgeSceneProps) {
  if (variant === 'sidebar') return <SidebarDwarf className={className} />;
  if (variant === 'complete') return <CompletionDwarf className={className} />;
  return <ForgeScene className={className} working={variant === 'working'} />;
}

/* ── Reusable Dwarf — chibi style, big head + beard ── */
function ChibiDwarf({ x, y, scale = 1, beardColor = '#8B6914', helmetColor = '#6B5B3A', skinColor = '#D4A574', tunicColor = '#5C4033' }: {
  x: number; y: number; scale?: number; beardColor?: string; helmetColor?: string; skinColor?: string; tunicColor?: string;
}) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {/* === HELMET with horns === */}
      {/* Helmet dome */}
      <ellipse cx="0" cy="-28" rx="18" ry="12" fill={helmetColor} />
      {/* Helmet rim */}
      <rect x="-20" y="-22" width="40" height="5" rx="2" fill={helmetColor} />
      {/* Helmet band detail */}
      <rect x="-18" y="-20" width="36" height="2" rx="1" fill="#967B4E" />
      {/* Left horn — curved upward */}
      <path d="M-18 -24 Q-28 -40 -22 -50" stroke="#C4A35A" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M-18 -24 Q-28 -40 -22 -50" stroke="#D4B36A" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Right horn — curved upward */}
      <path d="M18 -24 Q28 -40 22 -50" stroke="#C4A35A" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M18 -24 Q28 -40 22 -50" stroke="#D4B36A" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* === FACE === */}
      {/* Skin visible between helmet and beard */}
      <rect x="-14" y="-20" width="28" height="14" rx="4" fill={skinColor} />
      {/* Eyes — determined, glowing */}
      <ellipse cx="-7" cy="-14" rx="3" ry="2.5" fill="white" />
      <ellipse cx="7" cy="-14" rx="3" ry="2.5" fill="white" />
      <circle cx="-6" cy="-14" r="2" fill="#2A1A0A" />
      <circle cx="8" cy="-14" r="2" fill="#2A1A0A" />
      {/* Pupil highlight */}
      <circle cx="-5" cy="-15" r="0.7" fill="white" />
      <circle cx="9" cy="-15" r="0.7" fill="white" />
      {/* Bushy eyebrows */}
      <path d="M-12 -18 Q-7 -22 -2 -18" stroke="#4A3728" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M2 -18 Q7 -22 12 -18" stroke="#4A3728" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Nose — big round dwarf nose */}
      <ellipse cx="0" cy="-9" rx="4" ry="3" fill={skinColor} />
      <ellipse cx="0" cy="-8" rx="3.5" ry="2.5" fill="#C4956A" />

      {/* === MAGNIFICENT BEARD === */}
      {/* Main beard mass — huge, flowing */}
      <path
        d={`M-16 -7
            Q-20 5 -18 20
            Q-14 35 0 38
            Q14 35 18 20
            Q20 5 16 -7 Z`}
        fill={beardColor}
      />
      {/* Beard texture — braids/waves */}
      <path d="M-10 0 Q-8 15 -6 30" stroke="#A07A1A" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M0 -2 Q0 15 0 32" stroke="#A07A1A" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M10 0 Q8 15 6 30" stroke="#A07A1A" strokeWidth="1.5" fill="none" opacity="0.5" />
      {/* Beard braid tips */}
      <circle cx="-6" cy="32" r="2" fill="#A07A1A" />
      <circle cx="6" cy="32" r="2" fill="#A07A1A" />
      {/* Mustache curls */}
      <path d="M-4 -6 Q-12 -2 -16 -7" stroke={beardColor} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M4 -6 Q12 -2 16 -7" stroke={beardColor} strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* === STOCKY BODY === */}
      {/* Tunic/armor */}
      <path
        d="M-18 15 L-22 55 L22 55 L18 15 Z"
        fill={tunicColor}
      />
      {/* Belt */}
      <rect x="-20" y="40" width="40" height="6" rx="2" fill="#3A2A1A" />
      {/* Belt buckle — ornate circle */}
      <circle cx="0" cy="43" r="4" fill="#C4A35A" stroke="#967B4E" strokeWidth="1" />
      <circle cx="0" cy="43" r="2" fill="#967B4E" />

      {/* === SHORT THICK LEGS === */}
      <rect x="-18" y="55" width="14" height="18" rx="4" fill="#4A3A2A" />
      <rect x="4" y="55" width="14" height="18" rx="4" fill="#4A3A2A" />
      {/* Boots */}
      <path d="M-20 70 L-20 76 Q-18 80 -2 78 L-2 70 Z" fill="#3A2618" />
      <path d="M2 70 L2 76 Q4 80 20 78 L20 70 Z" fill="#3A2618" />
      {/* Boot buckles */}
      <rect x="-14" y="72" width="6" height="3" rx="1" fill="#967B4E" />
      <rect x="8" y="72" width="6" height="3" rx="1" fill="#967B4E" />
    </g>
  );
}

/* ── Anvil ── */
function Anvil({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {/* Anvil body — classic horn shape */}
      <path d="M-25 0 L-30 -15 L30 -15 L35 -5 L45 -5 L45 0 Z" fill="#4A4A4A" />
      {/* Anvil face (top) */}
      <rect x="-28" y="-20" width="56" height="6" rx="1" fill="#5A5A5A" />
      {/* Anvil horn (pointed end) */}
      <path d="M28 -17 L50 -12 L50 -8 L28 -14 Z" fill="#555" />
      {/* Anvil base */}
      <path d="M-20 0 L-25 15 L25 15 L20 0 Z" fill="#3A3A3A" />
      {/* Highlight on face */}
      <rect x="-24" y="-19" width="48" height="2" rx="1" fill="#6A6A6A" opacity="0.5" />
    </g>
  );
}

/* ── War Hammer ── */
function WarHammer({ x, y, rotation = 0 }: { x: number; y: number; rotation?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      {/* Handle */}
      <rect x="-2" y="0" width="4" height="40" rx="2" fill="#6B4226" />
      <rect x="-1.5" y="2" width="3" height="36" rx="1.5" fill="#7B5236" />
      {/* Hammer head */}
      <rect x="-14" y="-8" width="28" height="12" rx="3" fill="#5A5A5A" />
      <rect x="-12" y="-6" width="24" height="8" rx="2" fill="#6A6A6A" />
      {/* Rune on hammer */}
      <text x="-3" y="1" fontSize="6" fill="#C4A35A" fontFamily="serif" opacity="0.7">&#x16A0;</text>
    </g>
  );
}

/* ── Sidebar: Single dwarf hammering at an anvil ── */
function SidebarDwarf({ className }: { className: string }) {
  return (
    <div className={`dwarf-forge-sidebar ${className}`}>
      <svg viewBox="0 0 200 100" className="w-full h-auto opacity-50 hover:opacity-80 transition-opacity duration-500">
        {/* Anvil */}
        <Anvil x={130} y={75} scale={0.7} />

        {/* Dwarf */}
        <g transform="translate(80, 10)">
          <g className="dwarf-hammer-swing">
            <g transform="scale(0.6)">
              <ChibiDwarf x={0} y={20} beardColor="#B8860B" helmetColor="#6B5B3A" />
            </g>
            {/* Arm + hammer (separate for animation) */}
            <g className="dwarf-arm">
              <WarHammer x={38} y={10} rotation={-30} />
            </g>
          </g>
        </g>

        {/* Sparks */}
        <g className="dwarf-sparks">
          <circle cx="135" cy="55" r="2" fill="#FFB347" />
          <circle cx="142" cy="48" r="1.5" fill="#FF8C00" />
          <circle cx="128" cy="50" r="1" fill="#FFD700" />
          <circle cx="148" cy="52" r="1.8" fill="#FF6B00" />
        </g>

        {/* Forge glow on ground */}
        <ellipse cx="110" cy="90" rx="50" ry="8" fill="#F97316" opacity="0.06" />
      </svg>
    </div>
  );
}

/* ── Full forge scene with multiple dwarves ── */
function ForgeScene({ className, working }: { className: string; working: boolean }) {
  return (
    <div className={`dwarf-forge-scene ${working ? 'dwarf-forge-working' : 'dwarf-forge-idle'} ${className}`}>
      <svg viewBox="0 0 700 250" className="w-full h-auto">
        <defs>
          <radialGradient id="forge-fire-glow" cx="50%" cy="80%" r="50%">
            <stop offset="0%" stopColor="#F97316" stopOpacity="0.2" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="forge-hearth" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF4500" stopOpacity="0.9" />
            <stop offset="30%" stopColor="#FF6B00" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#1A1008" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Cave ceiling arch — stone texture */}
        <path d="M0 50 Q175 5 350 20 Q525 5 700 50 L700 0 L0 0 Z" fill="#0F0D0A" />
        {/* Cave arch edge detail */}
        <path d="M0 50 Q175 5 350 20 Q525 5 700 50" fill="none" stroke="#2A2018" strokeWidth="2" />
        {/* Stalactites */}
        <path d="M100 50 L105 72 L110 50" fill="#1A1510" />
        <path d="M250 35 L254 58 L258 35" fill="#1A1510" />
        <path d="M480 42 L484 65 L488 42" fill="#1A1510" />
        <path d="M600 48 L603 62 L606 48" fill="#1A1510" />

        {/* Floor */}
        <rect x="0" y="215" width="700" height="35" fill="#0C0A08" />
        <line x1="0" y1="215" x2="700" y2="215" stroke="#2A2018" strokeWidth="1" />
        {/* Floor glow from forge */}
        <ellipse cx="350" cy="218" rx="200" ry="15" fill="#F97316" opacity="0.08" />

        {/* ── CENTRAL FORGE / FURNACE ── */}
        <g>
          {/* Stone furnace structure */}
          <path d="M300 100 L310 70 L390 70 L400 100 L400 200 L300 200 Z" fill="#2A2018" stroke="#3A3028" strokeWidth="1" />
          {/* Furnace opening — arch */}
          <path d="M315 200 L315 140 Q350 110 385 140 L385 200 Z" fill="#0A0806" />
          {/* Fire inside furnace */}
          <ellipse cx="350" cy="170" rx="28" ry="20" fill="url(#forge-hearth)" className={working ? 'forge-fire-bright' : 'ember-glow'} />
          {/* Flames */}
          <g className={working ? 'forge-flames-active' : 'forge-flames-idle'}>
            <path d="M335 170 Q337 140 340 170" fill="#FF6B00" opacity="0.8" />
            <path d="M345 170 Q348 125 352 170" fill="#FFB347" opacity="0.9" />
            <path d="M355 170 Q358 135 362 170" fill="#FF4500" opacity="0.7" />
            <path d="M365 170 Q367 145 370 170" fill="#FF8C00" opacity="0.6" />
          </g>
          {/* Chimney */}
          <rect x="330" y="30" width="40" height="42" fill="#1A1510" stroke="#2A2018" strokeWidth="1" />
          {/* Smoke */}
          <g className="forge-smoke">
            <circle cx="348" cy="25" r="6" fill="#4A4040" opacity="0.12" />
            <circle cx="354" cy="14" r="8" fill="#4A4040" opacity="0.08" />
            <circle cx="346" cy="3" r="10" fill="#4A4040" opacity="0.04" />
          </g>
        </g>

        {/* ── DWARF 1: BLACKSMITH (left of forge) ── */}
        <g className="dwarf-smith">
          {/* Anvil */}
          <Anvil x={180} y={195} scale={0.9} />

          <g className="dwarf-hammer-swing">
            {/* Dwarf body */}
            <ChibiDwarf x={120} y={130} scale={0.85} beardColor="#B8860B" helmetColor="#6B5B3A" tunicColor="#5C4033" />
            {/* Hammer arm — animated */}
            <g className="dwarf-arm">
              <WarHammer x={158} y={120} rotation={-40} />
            </g>
          </g>

          {/* Sparks from anvil */}
          <g className="dwarf-sparks">
            <circle cx="190" cy="170" r="2.5" fill="#FFD700" />
            <circle cx="200" cy="162" r="1.8" fill="#FF8C00" />
            <circle cx="182" cy="165" r="1.5" fill="#FFB347" />
            <circle cx="205" cy="168" r="2" fill="#FF4500" />
            <circle cx="195" cy="158" r="1.2" fill="#FFEE58" />
          </g>

          {/* Hot metal piece on anvil — glowing */}
          <rect x="165" y="174" width="20" height="5" rx="1" fill="#FF6B00" className="ember-glow" />
        </g>

        {/* ── DWARF 2: BELLOWS OPERATOR (right of forge) ── */}
        <g className="dwarf-bellows">
          {/* Large bellows */}
          <g className="bellows-pump">
            <path d="M430 160 L470 140 L470 190 Z" fill="#4A3A2A" stroke="#5A4A3A" strokeWidth="1" />
            <path d="M470 140 L500 148 L500 182 L470 190 Z" fill="#3A2A1A" stroke="#5A4A3A" strokeWidth="1" />
            {/* Bellows nozzle */}
            <rect x="415" y="166" width="18" height="6" rx="2" fill="#5A5A5A" />
          </g>

          {/* Dwarf pushing bellows */}
          <g className="dwarf-bellows-push">
            <ChibiDwarf x={540} y={130} scale={0.8} beardColor="#A0522D" helmetColor="#5A4A3A" tunicColor="#4A3828" skinColor="#C8936A" />
          </g>
        </g>

        {/* ── DWARF 3: CARRYING ORE (far left) ── */}
        <g className="dwarf-carrier">
          <g className="dwarf-walk">
            <ChibiDwarf x={45} y={135} scale={0.75} beardColor="#CD853F" helmetColor="#5C4830" tunicColor="#4E3B2A" skinColor="#D4A574" />
            {/* Sack of ore on shoulder */}
            <g transform="translate(30, 115)">
              <ellipse cx="0" cy="0" rx="15" ry="10" fill="#6B5840" />
              <ellipse cx="0" cy="-2" rx="13" ry="8" fill="#7B6850" />
              {/* Ore chunks poking out */}
              <circle cx="-5" cy="-6" r="3" fill="#8B7355" />
              <circle cx="4" cy="-7" r="2.5" fill="#C4A35A" />
              <circle cx="-1" cy="-8" r="2" fill="#967B4E" />
            </g>
          </g>
        </g>

        {/* ── Rune carvings on cave wall ── */}
        <text x="40" y="70" fontSize="12" fill="#C4A35A" opacity="0.1" fontFamily="serif">&#x16A0; &#x16A2; &#x16A6; &#x16B1;</text>
        <text x="600" y="65" fontSize="10" fill="#C4A35A" opacity="0.1" fontFamily="serif">&#x16B2; &#x16B7; &#x16C1;</text>

        {/* ── Props: barrel, weapons rack ── */}
        {/* Barrel */}
        <g transform="translate(630, 175)">
          <rect x="-12" y="0" width="24" height="30" rx="4" fill="#5A4A3A" stroke="#6B5B4B" strokeWidth="1" />
          <rect x="-14" y="5" width="28" height="3" rx="1" fill="#6B5B4B" />
          <rect x="-14" y="22" width="28" height="3" rx="1" fill="#6B5B4B" />
          <ellipse cx="0" cy="0" rx="12" ry="4" fill="#6B5B4B" />
        </g>
        {/* Shield leaning on wall */}
        <g transform="translate(660, 140)">
          <ellipse cx="0" cy="0" rx="12" ry="15" fill="#5A4A3A" stroke="#C4A35A" strokeWidth="1.5" />
          <line x1="0" y1="-12" x2="0" y2="12" stroke="#C4A35A" strokeWidth="1" />
          <line x1="-10" y1="0" x2="10" y2="0" stroke="#C4A35A" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}

/* ── Completion: Triumphant dwarf holding up finished sword ── */
function CompletionDwarf({ className }: { className: string }) {
  return (
    <div className={`dwarf-forge-complete ${className}`}>
      <svg viewBox="0 0 200 180" className="w-full h-auto">
        <defs>
          <radialGradient id="item-glow" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#FFD700" stopOpacity="0.5" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sword-blade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0E0E0" />
            <stop offset="50%" stopColor="#C0C0C0" />
            <stop offset="100%" stopColor="#A0A0A0" />
          </linearGradient>
        </defs>

        {/* Radial glow behind sword */}
        <circle cx="100" cy="50" r="60" fill="url(#item-glow)" className="forge-pulse" />

        <g className="dwarf-triumph">
          {/* Dwarf — centered, bigger */}
          <ChibiDwarf x={100} y={85} scale={1.1} beardColor="#DAA520" helmetColor="#8B7355" tunicColor="#6B4226" />

          {/* Arms raised — override the body arms */}
          {/* Left arm up */}
          <line x1="78" y1="100" x2="68" y2="60" stroke="#6B4226" strokeWidth="6" strokeLinecap="round" />
          {/* Right arm up */}
          <line x1="122" y1="100" x2="132" y2="60" stroke="#6B4226" strokeWidth="6" strokeLinecap="round" />
          {/* Hands */}
          <circle cx="68" cy="58" r="4" fill="#D4A574" />
          <circle cx="132" cy="58" r="4" fill="#D4A574" />

          {/* === GLOWING SWORD held overhead === */}
          <g className="forged-item-glow">
            {/* Sword blade */}
            <path d="M70 55 L100 10 L130 55 Z" fill="url(#sword-blade)" />
            <path d="M85 55 L100 20 L115 55 Z" fill="#D0D0D0" opacity="0.5" />
            {/* Sword crossguard */}
            <rect x="65" y="52" width="70" height="6" rx="3" fill="#C4A35A" />
            <rect x="70" y="53" width="60" height="4" rx="2" fill="#DAA520" />
            {/* Rune glow on blade */}
            <text x="90" y="42" fontSize="8" fill="#FFD700" opacity="0.8" fontFamily="serif">&#x16A0;</text>
            {/* Blade edge glow */}
            <path d="M100 15 L100 50" stroke="#FFD700" strokeWidth="1" opacity="0.4" />
          </g>
        </g>

        {/* Victory sparks radiating outward */}
        <g className="victory-sparks">
          <circle cx="40" cy="30" r="3" fill="#FFD700" />
          <circle cx="160" cy="25" r="2.5" fill="#FF8C00" />
          <circle cx="30" cy="60" r="2" fill="#FFB347" />
          <circle cx="170" cy="55" r="2.8" fill="#FF4500" />
          <circle cx="55" cy="15" r="1.8" fill="#FFEE58" />
          <circle cx="145" cy="12" r="2.2" fill="#FFD700" />
          <circle cx="100" cy="5" r="1.5" fill="#FF8C00" />
          <circle cx="45" cy="50" r="1.5" fill="#FFB347" />
          <circle cx="155" cy="45" r="2" fill="#FF6B00" />
        </g>

        {/* Ground */}
        <line x1="30" y1="170" x2="170" y2="170" stroke="#2A2018" strokeWidth="1" />
      </svg>
    </div>
  );
}
