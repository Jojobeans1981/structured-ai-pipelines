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

/**
 * Reusable chibi dwarf. Origin (0,0) is at the center of the torso.
 * Includes: helmet with horns, face, beard, body, arms (left rests, right holds out),
 * legs, and boots. Arms are skin-colored and clearly attached to the body.
 */
function ChibiDwarf({ x, y, scale = 1, beardColor = '#8B6914', helmetColor = '#6B5B3A', skinColor = '#D4A574', tunicColor = '#5C4033', showLeftArm = true, showRightArm = true }: {
  x: number; y: number; scale?: number; beardColor?: string; helmetColor?: string;
  skinColor?: string; tunicColor?: string; showLeftArm?: boolean; showRightArm?: boolean;
}) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {/* === HELMET with horns === */}
      <ellipse cx="0" cy="-28" rx="18" ry="12" fill={helmetColor} />
      <rect x="-20" y="-22" width="40" height="5" rx="2" fill={helmetColor} />
      <rect x="-18" y="-20" width="36" height="2" rx="1" fill="#967B4E" />
      {/* Left horn */}
      <path d="M-18 -24 Q-28 -40 -22 -50" stroke="#C4A35A" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M-18 -24 Q-28 -40 -22 -50" stroke="#D4B36A" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Right horn */}
      <path d="M18 -24 Q28 -40 22 -50" stroke="#C4A35A" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M18 -24 Q28 -40 22 -50" stroke="#D4B36A" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* === FACE === */}
      <rect x="-14" y="-20" width="28" height="14" rx="4" fill={skinColor} />
      {/* Eyes */}
      <ellipse cx="-7" cy="-14" rx="3" ry="2.5" fill="white" />
      <ellipse cx="7" cy="-14" rx="3" ry="2.5" fill="white" />
      <circle cx="-6" cy="-14" r="2" fill="#2A1A0A" />
      <circle cx="8" cy="-14" r="2" fill="#2A1A0A" />
      <circle cx="-5" cy="-15" r="0.7" fill="white" />
      <circle cx="9" cy="-15" r="0.7" fill="white" />
      {/* Bushy eyebrows */}
      <path d="M-12 -18 Q-7 -22 -2 -18" stroke="#4A3728" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M2 -18 Q7 -22 12 -18" stroke="#4A3728" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Nose */}
      <ellipse cx="0" cy="-9" rx="4" ry="3" fill={skinColor} />
      <ellipse cx="0" cy="-8" rx="3.5" ry="2.5" fill="#C4956A" />

      {/* === BEARD === */}
      <path
        d={`M-16 -7 Q-20 5 -18 20 Q-14 35 0 38 Q14 35 18 20 Q20 5 16 -7 Z`}
        fill={beardColor}
      />
      <path d="M-10 0 Q-8 15 -6 30" stroke="#A07A1A" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M0 -2 Q0 15 0 32" stroke="#A07A1A" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M10 0 Q8 15 6 30" stroke="#A07A1A" strokeWidth="1.5" fill="none" opacity="0.5" />
      <circle cx="-6" cy="32" r="2" fill="#A07A1A" />
      <circle cx="6" cy="32" r="2" fill="#A07A1A" />
      {/* Mustache */}
      <path d="M-4 -6 Q-12 -2 -16 -7" stroke={beardColor} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M4 -6 Q12 -2 16 -7" stroke={beardColor} strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* === BODY === */}
      <path d="M-18 15 L-22 55 L22 55 L18 15 Z" fill={tunicColor} />
      {/* Belt */}
      <rect x="-20" y="40" width="40" height="6" rx="2" fill="#3A2A1A" />
      <circle cx="0" cy="43" r="4" fill="#C4A35A" stroke="#967B4E" strokeWidth="1" />
      <circle cx="0" cy="43" r="2" fill="#967B4E" />

      {/* === ARMS (skin-colored, thick, attached to shoulders) === */}
      {showLeftArm && (
        <g>
          {/* Left arm — resting at side / slightly forward */}
          <path d="M-20 18 L-32 35 L-28 48" stroke={skinColor} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Left hand */}
          <circle cx="-28" cy="48" r="5" fill={skinColor} />
        </g>
      )}
      {showRightArm && (
        <g>
          {/* Right arm — resting at side */}
          <path d="M20 18 L32 35 L28 48" stroke={skinColor} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Right hand */}
          <circle cx="28" cy="48" r="5" fill={skinColor} />
        </g>
      )}

      {/* === LEGS === */}
      <rect x="-18" y="55" width="14" height="18" rx="4" fill="#4A3A2A" />
      <rect x="4" y="55" width="14" height="18" rx="4" fill="#4A3A2A" />
      {/* Boots */}
      <path d="M-20 70 L-20 76 Q-18 80 -2 78 L-2 70 Z" fill="#3A2618" />
      <path d="M2 70 L2 76 Q4 80 20 78 L20 70 Z" fill="#3A2618" />
      <rect x="-14" y="72" width="6" height="3" rx="1" fill="#967B4E" />
      <rect x="8" y="72" width="6" height="3" rx="1" fill="#967B4E" />
    </g>
  );
}

/**
 * Blacksmith dwarf — right arm holds hammer, swings down to strike anvil.
 * Arm rests at ~45° downward toward anvil. Animation lifts it back then slams down.
 * Pivot point is the right shoulder.
 */
function SmithDwarf({ x, y, scale = 1, skinColor = '#D4A574' }: { x: number; y: number; scale?: number; skinColor?: string }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {/* Dwarf body (hide right arm — we draw our own with hammer) */}
      <ChibiDwarf x={0} y={0} beardColor="#B8860B" helmetColor="#6B5B3A" tunicColor="#5C4033" skinColor={skinColor} showRightArm={false} />

      {/* Right arm + hammer — pivots from right shoulder (20, 18)
          Resting position: arm reaches DOWN and RIGHT toward the anvil.
          Animation rotates negative (up/back) then returns to 0 (strike). */}
      <g className="dwarf-arm" style={{ transformOrigin: '20px 18px' }}>
        {/* Arm reaches from shoulder (20,18) toward anvil at ~30° down-right.
            Shoulder at abs (170,148), anvil surface at abs (230,185).
            dx=60 dy=37, angle ≈ 32°.
            Upper arm: shoulder to elbow, ~halfway there */}
        <path d="M20 18 L48 35" stroke={skinColor} strokeWidth="8" fill="none" strokeLinecap="round" />
        {/* Forearm: elbow to hand near anvil */}
        <path d="M48 35 L72 50" stroke={skinColor} strokeWidth="7" fill="none" strokeLinecap="round" />
        {/* Hand gripping handle */}
        <circle cx="72" cy="50" r="5" fill={skinColor} />
        {/* Hammer handle — angled to match the arm direction, extends past hand.
            Handle goes from above hand to below, tilted ~30° matching arm angle.
            The head end extends further toward the anvil. */}
        <line x1="64" y1="38" x2="88" y2="62" stroke="#6B4226" strokeWidth="5" strokeLinecap="round" />
        <line x1="65" y1="39" x2="87" y2="61" stroke="#7B5236" strokeWidth="3" strokeLinecap="round" />
        {/* Hammer head — at the far end, past the hand, angled to hit flat on anvil.
            Rotated ~30° to match handle angle. Head is a thick rectangle. */}
        <g transform="translate(85, 59) rotate(32)">
          <rect x="-13" y="-8" width="26" height="16" rx="3" fill="#5A5A5A" />
          <rect x="-11" y="-6" width="22" height="12" rx="2" fill="#6A6A6A" />
          <text x="-4" y="4" fontSize="7" fill="#C4A35A" fontFamily="serif" opacity="0.7">&#x16A0;</text>
        </g>
      </g>
    </g>
  );
}

/** Bellows dwarf — both arms pushing forward */
function BellowsDwarf({ x, y, scale = 1, skinColor = '#C8936A' }: { x: number; y: number; scale?: number; skinColor?: string }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <ChibiDwarf x={0} y={0} beardColor="#A0522D" helmetColor="#5A4A3A" tunicColor="#4A3828" skinColor={skinColor} showLeftArm={false} showRightArm={false} />
      {/* Both arms pushing forward (to the left, toward bellows) */}
      <g className="dwarf-bellows-arms">
        {/* Left arm pushing */}
        <path d="M-20 18 L-40 22 L-52 20" stroke={skinColor} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="-52" cy="20" r="5" fill={skinColor} />
        {/* Right arm pushing */}
        <path d="M-16 25 L-38 30 L-50 28" stroke={skinColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="-50" cy="28" r="4.5" fill={skinColor} />
      </g>
    </g>
  );
}

/* ── Anvil ── */
function Anvil({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <path d="M-25 0 L-30 -15 L30 -15 L35 -5 L45 -5 L45 0 Z" fill="#4A4A4A" />
      <rect x="-28" y="-20" width="56" height="6" rx="1" fill="#5A5A5A" />
      <path d="M28 -17 L50 -12 L50 -8 L28 -14 Z" fill="#555" />
      <path d="M-20 0 L-25 15 L25 15 L20 0 Z" fill="#3A3A3A" />
      <rect x="-24" y="-19" width="48" height="2" rx="1" fill="#6A6A6A" opacity="0.5" />
    </g>
  );
}

/* ── Sidebar: Single dwarf hammering at an anvil ── */
function SidebarDwarf({ className }: { className: string }) {
  return (
    <div className={`dwarf-forge-sidebar ${className}`}>
      <svg viewBox="0 0 220 120" className="w-full h-auto opacity-70 hover:opacity-100 transition-opacity duration-500">
        {/* Anvil to the right of dwarf */}
        <Anvil x={155} y={92} scale={0.65} />
        {/* Hot metal on anvil */}
        <rect x="142" y="73" width="18" height="4" rx="1" fill="#FF6B00" className="ember-glow" />

        {/* Dwarf with hammer */}
        <g className="dwarf-hammer-swing">
          <SmithDwarf x={85} y={40} scale={0.55} />
        </g>

        {/* Sparks from anvil */}
        <g className="dwarf-sparks">
          <circle cx="158" cy="65" r="2" fill="#FFB347" />
          <circle cx="165" cy="58" r="1.5" fill="#FF8C00" />
          <circle cx="150" cy="60" r="1" fill="#FFD700" />
          <circle cx="170" cy="62" r="1.8" fill="#FF6B00" />
        </g>

        {/* Forge glow on ground */}
        <ellipse cx="120" cy="105" rx="60" ry="8" fill="#F97316" opacity="0.06" />
      </svg>
    </div>
  );
}

/* ── Full forge scene with multiple dwarves ── */
function ForgeScene({ className, working }: { className: string; working: boolean }) {
  return (
    <div className={`dwarf-forge-scene ${working ? 'dwarf-forge-working' : 'dwarf-forge-idle'} ${className}`}>
      <svg viewBox="0 0 700 260" className="w-full h-auto">
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

        {/* Cave ceiling */}
        <path d="M0 50 Q175 5 350 20 Q525 5 700 50 L700 0 L0 0 Z" fill="#0F0D0A" />
        <path d="M0 50 Q175 5 350 20 Q525 5 700 50" fill="none" stroke="#2A2018" strokeWidth="2" />
        {/* Stalactites */}
        <path d="M100 50 L105 72 L110 50" fill="#1A1510" />
        <path d="M250 35 L254 58 L258 35" fill="#1A1510" />
        <path d="M480 42 L484 65 L488 42" fill="#1A1510" />
        <path d="M600 48 L603 62 L606 48" fill="#1A1510" />

        {/* Floor */}
        <rect x="0" y="225" width="700" height="35" fill="#0C0A08" />
        <line x1="0" y1="225" x2="700" y2="225" stroke="#2A2018" strokeWidth="1" />
        <ellipse cx="350" cy="228" rx="200" ry="15" fill="#F97316" opacity="0.08" />

        {/* ── CENTRAL FORGE / FURNACE ── */}
        <g>
          <path d="M300 100 L310 70 L390 70 L400 100 L400 210 L300 210 Z" fill="#2A2018" stroke="#3A3028" strokeWidth="1" />
          <path d="M315 210 L315 150 Q350 120 385 150 L385 210 Z" fill="#0A0806" />
          <ellipse cx="350" cy="180" rx="28" ry="20" fill="url(#forge-hearth)" className={working ? 'forge-fire-bright' : 'ember-glow'} />
          <g className={working ? 'forge-flames-active' : 'forge-flames-idle'}>
            <path d="M335 180 Q337 150 340 180" fill="#FF6B00" opacity="0.8" />
            <path d="M345 180 Q348 135 352 180" fill="#FFB347" opacity="0.9" />
            <path d="M355 180 Q358 145 362 180" fill="#FF4500" opacity="0.7" />
            <path d="M365 180 Q367 155 370 180" fill="#FF8C00" opacity="0.6" />
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
          {/* Anvil — to the right of dwarf, near forge */}
          <Anvil x={230} y={205} />
          {/* Hot metal on anvil */}
          <rect x="215" y="183" width="24" height="5" rx="1" fill="#FF6B00" className="ember-glow" />

          {/* Blacksmith dwarf — hammer swings from shoulder */}
          <g className="dwarf-hammer-swing">
            <SmithDwarf x={150} y={130} scale={0.95} />
          </g>

          {/* Sparks from anvil */}
          <g className="dwarf-sparks">
            <circle cx="240" cy="175" r="2.5" fill="#FFD700" />
            <circle cx="250" cy="167" r="1.8" fill="#FF8C00" />
            <circle cx="232" cy="170" r="1.5" fill="#FFB347" />
            <circle cx="255" cy="173" r="2" fill="#FF4500" />
            <circle cx="245" cy="163" r="1.2" fill="#FFEE58" />
          </g>
        </g>

        {/* ── DWARF 2: BELLOWS OPERATOR (right of forge) ── */}
        <g className="dwarf-bellows">
          {/* Bellows device */}
          <g className="bellows-pump">
            {/* Nozzle pointing at forge */}
            <rect x="410" y="176" width="20" height="6" rx="2" fill="#5A5A5A" />
            {/* Bellows body — accordion shape */}
            <path d="M430 165 L465 150 L465 200 L430 185 Z" fill="#4A3A2A" stroke="#5A4A3A" strokeWidth="1" />
            <path d="M465 150 L495 155 L495 195 L465 200 Z" fill="#3A2A1A" stroke="#5A4A3A" strokeWidth="1" />
            {/* Handle bar */}
            <rect x="492" y="168" width="12" height="6" rx="2" fill="#6B4226" />
          </g>

          {/* Bellows dwarf — facing left, pushing bellows */}
          <g className="dwarf-bellows-push">
            <BellowsDwarf x={550} y={140} scale={0.85} />
          </g>
        </g>

        {/* ── DWARF 3: CARRYING ORE (far left) ── */}
        <g className="dwarf-carrier">
          <g className="dwarf-walk">
            <ChibiDwarf x={55} y={145} scale={0.75} beardColor="#CD853F" helmetColor="#5C4830" tunicColor="#4E3B2A" />
            {/* Sack of ore on back/shoulder */}
            <g transform="translate(35, 125)">
              <ellipse cx="0" cy="0" rx="15" ry="12" fill="#6B5840" />
              <ellipse cx="0" cy="-2" rx="13" ry="9" fill="#7B6850" />
              <circle cx="-5" cy="-7" r="3" fill="#8B7355" />
              <circle cx="4" cy="-8" r="2.5" fill="#C4A35A" />
              <circle cx="-1" cy="-9" r="2" fill="#967B4E" />
            </g>
          </g>
        </g>

        {/* Rune carvings */}
        <text x="40" y="70" fontSize="12" fill="#C4A35A" opacity="0.1" fontFamily="serif">&#x16A0; &#x16A2; &#x16A6; &#x16B1;</text>
        <text x="600" y="65" fontSize="10" fill="#C4A35A" opacity="0.1" fontFamily="serif">&#x16B2; &#x16B7; &#x16C1;</text>

        {/* Props */}
        {/* Barrel */}
        <g transform="translate(640, 185)">
          <rect x="-12" y="0" width="24" height="30" rx="4" fill="#5A4A3A" stroke="#6B5B4B" strokeWidth="1" />
          <rect x="-14" y="5" width="28" height="3" rx="1" fill="#6B5B4B" />
          <rect x="-14" y="22" width="28" height="3" rx="1" fill="#6B5B4B" />
          <ellipse cx="0" cy="0" rx="12" ry="4" fill="#6B5B4B" />
        </g>
        {/* Shield */}
        <g transform="translate(670, 150)">
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
      <svg viewBox="0 0 200 200" className="w-full h-auto">
        <defs>
          <radialGradient id="item-glow" cx="50%" cy="35%" r="50%">
            <stop offset="0%" stopColor="#FFD700" stopOpacity="0.5" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sword-blade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0E0E0" />
            <stop offset="50%" stopColor="#C0C0C0" />
            <stop offset="100%" stopColor="#A0A0A0" />
          </linearGradient>
        </defs>

        {/* Radial glow */}
        <circle cx="100" cy="55" r="60" fill="url(#item-glow)" className="forge-pulse" />

        <g className="dwarf-triumph">
          {/* Dwarf body — no default arms, we draw raised arms */}
          <ChibiDwarf x={100} y={100} scale={1.0} beardColor="#DAA520" helmetColor="#8B7355" tunicColor="#6B4226" showLeftArm={false} showRightArm={false} />

          {/* Left arm raised up */}
          <path d="M80 118 L65 90 L60 65" stroke="#D4A574" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="60" cy="63" r="5" fill="#D4A574" />

          {/* Right arm raised up */}
          <path d="M120 118 L135 90 L140 65" stroke="#D4A574" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="140" cy="63" r="5" fill="#D4A574" />

          {/* === GLOWING SWORD held overhead === */}
          <g className="forged-item-glow">
            {/* Sword blade — triangular */}
            <path d="M72 60 L100 15 L128 60 Z" fill="url(#sword-blade)" />
            <path d="M85 60 L100 25 L115 60 Z" fill="#D0D0D0" opacity="0.4" />
            {/* Crossguard */}
            <rect x="67" y="58" width="66" height="7" rx="3" fill="#C4A35A" />
            <rect x="72" y="59" width="56" height="5" rx="2" fill="#DAA520" />
            {/* Rune on blade */}
            <text x="93" y="48" fontSize="8" fill="#FFD700" opacity="0.8" fontFamily="serif">&#x16A0;</text>
            {/* Blade glow line */}
            <path d="M100 20 L100 55" stroke="#FFD700" strokeWidth="1.5" opacity="0.4" />
          </g>
        </g>

        {/* Victory sparks */}
        <g className="victory-sparks">
          <circle cx="35" cy="30" r="3" fill="#FFD700" />
          <circle cx="165" cy="25" r="2.5" fill="#FF8C00" />
          <circle cx="25" cy="65" r="2" fill="#FFB347" />
          <circle cx="175" cy="60" r="2.8" fill="#FF4500" />
          <circle cx="50" cy="12" r="1.8" fill="#FFEE58" />
          <circle cx="150" cy="10" r="2.2" fill="#FFD700" />
          <circle cx="100" cy="5" r="1.5" fill="#FF8C00" />
          <circle cx="40" cy="55" r="1.5" fill="#FFB347" />
          <circle cx="160" cy="50" r="2" fill="#FF6B00" />
        </g>

        {/* Ground */}
        <line x1="30" y1="185" x2="170" y2="185" stroke="#2A2018" strokeWidth="1" />
      </svg>
    </div>
  );
}
