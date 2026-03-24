'use client';

/**
 * Dwarven Forge Scene — animated SVG dwarves working the mountain forge.
 * Inspired by Khazad-dum / Erebor from Lord of the Rings.
 *
 * Variants:
 *  - "sidebar"    — compact scene for sidebar bottom (anvil dwarf only)
 *  - "idle"       — full scene, slow ambient hammering
 *  - "working"    — full scene, fast hammering + sparks + bellows dwarf
 *  - "complete"   — dwarf holds up finished item triumphantly
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

/* ── Sidebar: Single dwarf hammering at an anvil ── */
function SidebarDwarf({ className }: { className: string }) {
  return (
    <div className={`dwarf-forge-sidebar ${className}`}>
      <svg viewBox="0 0 200 80" className="w-full h-auto opacity-40 hover:opacity-70 transition-opacity duration-500">
        {/* Anvil */}
        <path
          d="M85 65 L90 50 L130 50 L135 65 Z"
          fill="hsl(20 14% 18%)"
          stroke="hsl(25 40% 25%)"
          strokeWidth="0.5"
        />
        <rect x="95" y="45" width="30" height="6" rx="1" fill="hsl(20 14% 22%)" />

        {/* Dwarf body */}
        <g className="dwarf-hammer-swing">
          {/* Torso */}
          <rect x="60" y="38" width="20" height="18" rx="3" fill="hsl(20 14% 15%)" />
          {/* Head with hood/helmet */}
          <circle cx="70" cy="32" r="8" fill="hsl(20 14% 18%)" />
          {/* Helmet crest */}
          <path d="M63 30 Q70 22 77 30" fill="none" stroke="hsl(25 60% 35%)" strokeWidth="1.5" />
          {/* Beard */}
          <path
            d="M64 36 Q70 48 76 36"
            fill="hsl(25 30% 20%)"
            stroke="none"
          />
          {/* Eye (glowing) */}
          <circle cx="73" cy="31" r="1" fill="hsl(25 95% 53%)" className="ember-glow" />
          {/* Arm holding hammer */}
          <g className="dwarf-arm">
            <line x1="78" y1="42" x2="105" y2="30" stroke="hsl(20 14% 15%)" strokeWidth="3" strokeLinecap="round" />
            {/* Hammer head */}
            <rect x="100" y="24" width="12" height="8" rx="1" fill="hsl(20 12% 25%)" className="dwarf-hammer-head" />
            <rect x="104" y="22" width="4" height="12" rx="1" fill="hsl(25 40% 20%)" />
          </g>
          {/* Legs */}
          <line x1="65" y1="56" x2="62" y2="65" stroke="hsl(20 14% 15%)" strokeWidth="4" strokeLinecap="round" />
          <line x1="75" y1="56" x2="78" y2="65" stroke="hsl(20 14% 15%)" strokeWidth="4" strokeLinecap="round" />
          {/* Boots */}
          <ellipse cx="60" cy="66" rx="5" ry="3" fill="hsl(20 14% 12%)" />
          <ellipse cx="80" cy="66" rx="5" ry="3" fill="hsl(20 14% 12%)" />
        </g>

        {/* Sparks from anvil */}
        <g className="dwarf-sparks">
          <circle cx="110" cy="42" r="1" fill="hsl(35 95% 55%)" />
          <circle cx="115" cy="38" r="0.8" fill="hsl(25 95% 53%)" />
          <circle cx="108" cy="36" r="0.6" fill="hsl(40 96% 60%)" />
          <circle cx="118" cy="40" r="0.7" fill="hsl(15 90% 50%)" />
        </g>

        {/* Forge glow on ground */}
        <ellipse cx="100" cy="68" rx="40" ry="6" fill="hsl(25 95% 53%)" opacity="0.06" />
      </svg>
    </div>
  );
}

/* ── Full forge scene with multiple dwarves ── */
function ForgeScene({ className, working }: { className: string; working: boolean }) {
  return (
    <div className={`dwarf-forge-scene ${working ? 'dwarf-forge-working' : 'dwarf-forge-idle'} ${className}`}>
      <svg viewBox="0 0 600 200" className="w-full h-auto">
        {/* Mountain/cave backdrop */}
        <defs>
          <radialGradient id="forge-fire-glow" cx="50%" cy="80%" r="50%">
            <stop offset="0%" stopColor="hsl(25 95% 53%)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="forge-hearth" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(15 90% 50%)" stopOpacity="0.8" />
            <stop offset="40%" stopColor="hsl(25 95% 53%)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="hsl(20 14% 8%)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Cave ceiling arch */}
        <path
          d="M0 40 Q150 0 300 15 Q450 0 600 40 L600 0 L0 0 Z"
          fill="hsl(20 14% 6%)"
        />
        {/* Stalactites */}
        <path d="M80 40 L85 60 L90 40" fill="hsl(20 14% 10%)" />
        <path d="M200 30 L203 48 L206 30" fill="hsl(20 14% 10%)" />
        <path d="M400 35 L404 55 L408 35" fill="hsl(20 14% 10%)" />
        <path d="M520 38 L523 52 L526 38" fill="hsl(20 14% 10%)" />

        {/* Floor glow */}
        <rect x="0" y="170" width="600" height="30" fill="url(#forge-fire-glow)" />

        {/* ── Central Forge / Hearth ── */}
        <g>
          {/* Stone forge base */}
          <path
            d="M260 130 L270 100 L330 100 L340 130 Z"
            fill="hsl(20 14% 14%)"
            stroke="hsl(20 14% 20%)"
            strokeWidth="1"
          />
          {/* Fire in forge */}
          <ellipse cx="300" cy="105" rx="20" ry="10" fill="url(#forge-hearth)" className={working ? 'forge-fire-bright' : 'ember-glow'} />
          {/* Flames */}
          <g className={working ? 'forge-flames-active' : 'forge-flames-idle'}>
            <path d="M290 105 Q292 85 295 105" fill="hsl(25 95% 53%)" opacity="0.7" />
            <path d="M298 105 Q300 80 302 105" fill="hsl(35 95% 55%)" opacity="0.8" />
            <path d="M306 105 Q308 88 310 105" fill="hsl(15 90% 50%)" opacity="0.6" />
          </g>
          {/* Chimney */}
          <rect x="290" y="60" width="20" height="40" fill="hsl(20 14% 10%)" />
          {/* Smoke */}
          <g className="forge-smoke">
            <circle cx="298" cy="55" r="4" fill="hsl(20 5% 35%)" opacity="0.15" />
            <circle cx="302" cy="45" r="5" fill="hsl(20 5% 35%)" opacity="0.1" />
            <circle cx="297" cy="35" r="6" fill="hsl(20 5% 35%)" opacity="0.05" />
          </g>
        </g>

        {/* ── Dwarf 1: Blacksmith at anvil (left) ── */}
        <g className="dwarf-smith">
          {/* Anvil */}
          <path d="M140 170 L148 148 L192 148 L200 170 Z" fill="hsl(20 14% 18%)" stroke="hsl(25 40% 25%)" strokeWidth="0.5" />
          <rect x="153" y="142" width="34" height="7" rx="2" fill="hsl(20 14% 22%)" />

          {/* Dwarf body */}
          <g className="dwarf-hammer-swing">
            {/* Torso — stocky */}
            <path d="M105 128 L100 155 L135 155 L130 128 Z" fill="hsl(20 14% 15%)" />
            {/* Belt */}
            <rect x="102" y="145" width="31" height="4" rx="1" fill="hsl(25 30% 18%)" />
            <rect x="115" y="143" width="6" height="8" rx="1" fill="hsl(25 60% 30%)" /> {/* buckle */}
            {/* Head with helmet */}
            <circle cx="118" cy="118" r="12" fill="hsl(20 14% 18%)" />
            <path d="M107 115 Q118 102 129 115" fill="none" stroke="hsl(25 60% 35%)" strokeWidth="2" />
            {/* Horns on helmet */}
            <path d="M108 114 L102 104" stroke="hsl(25 40% 30%)" strokeWidth="2" strokeLinecap="round" />
            <path d="M128 114 L134 104" stroke="hsl(25 40% 30%)" strokeWidth="2" strokeLinecap="round" />
            {/* Beard — magnificent */}
            <path
              d="M108 122 Q110 145 118 148 Q126 145 128 122"
              fill="hsl(25 20% 22%)"
            />
            {/* Braids in beard */}
            <line x1="113" y1="130" x2="112" y2="142" stroke="hsl(25 30% 28%)" strokeWidth="1" />
            <line x1="123" y1="130" x2="124" y2="142" stroke="hsl(25 30% 28%)" strokeWidth="1" />
            {/* Eyes (glowing orange) */}
            <circle cx="114" cy="116" r="1.5" fill="hsl(25 95% 53%)" className="ember-glow" />
            <circle cx="122" cy="116" r="1.5" fill="hsl(25 95% 53%)" className="ember-glow" />
            {/* Hammer arm */}
            <g className="dwarf-arm">
              <line x1="130" y1="135" x2="165" y2="115" stroke="hsl(20 14% 15%)" strokeWidth="5" strokeLinecap="round" />
              {/* Hammer */}
              <rect x="158" y="108" width="16" height="10" rx="2" fill="hsl(20 12% 25%)" />
              <rect x="163" y="105" width="6" height="16" rx="1" fill="hsl(25 40% 20%)" />
            </g>
            {/* Legs — short and sturdy */}
            <line x1="110" y1="155" x2="106" y2="170" stroke="hsl(20 14% 15%)" strokeWidth="6" strokeLinecap="round" />
            <line x1="125" y1="155" x2="130" y2="170" stroke="hsl(20 14% 15%)" strokeWidth="6" strokeLinecap="round" />
            {/* Boots */}
            <ellipse cx="103" cy="172" rx="7" ry="4" fill="hsl(20 14% 12%)" />
            <ellipse cx="133" cy="172" rx="7" ry="4" fill="hsl(20 14% 12%)" />
          </g>

          {/* Sparks from anvil hit */}
          <g className="dwarf-sparks">
            <circle cx="170" cy="138" r="1.5" fill="hsl(35 95% 55%)" />
            <circle cx="178" cy="132" r="1" fill="hsl(25 95% 53%)" />
            <circle cx="165" cy="130" r="0.8" fill="hsl(40 96% 60%)" />
            <circle cx="182" cy="136" r="1.2" fill="hsl(15 90% 50%)" />
            <circle cx="175" cy="126" r="0.6" fill="hsl(35 95% 65%)" />
          </g>
        </g>

        {/* ── Dwarf 2: Bellows operator (right of forge) ── */}
        <g className="dwarf-bellows">
          {/* Bellows device */}
          <g className="bellows-pump">
            <path
              d="M370 130 L400 115 L400 145 Z"
              fill="hsl(20 14% 16%)"
              stroke="hsl(25 30% 22%)"
              strokeWidth="1"
            />
            <path
              d="M400 115 L420 120 L420 140 L400 145 Z"
              fill="hsl(20 14% 13%)"
              stroke="hsl(25 30% 22%)"
              strokeWidth="1"
            />
            {/* Nozzle toward forge */}
            <line x1="370" y1="130" x2="345" y2="120" stroke="hsl(20 14% 20%)" strokeWidth="3" />
          </g>

          {/* Dwarf */}
          <g className="dwarf-bellows-push">
            {/* Torso */}
            <path d="M430 125 L425 155 L460 155 L455 125 Z" fill="hsl(20 14% 15%)" />
            {/* Head */}
            <circle cx="442" cy="115" r="10" fill="hsl(20 14% 18%)" />
            {/* Helmet — rounded cap style */}
            <path d="M433 112 Q442 103 451 112" fill="hsl(20 14% 22%)" stroke="hsl(25 50% 30%)" strokeWidth="1.5" />
            {/* Beard */}
            <path d="M434 118 Q442 135 450 118" fill="hsl(15 20% 18%)" />
            {/* Eyes */}
            <circle cx="438" cy="114" r="1.2" fill="hsl(25 95% 53%)" className="ember-glow" />
            <circle cx="446" cy="114" r="1.2" fill="hsl(25 95% 53%)" className="ember-glow" />
            {/* Arms pushing bellows */}
            <line x1="430" y1="132" x2="420" y2="130" stroke="hsl(20 14% 15%)" strokeWidth="4" strokeLinecap="round" />
            <line x1="430" y1="138" x2="420" y2="140" stroke="hsl(20 14% 15%)" strokeWidth="4" strokeLinecap="round" />
            {/* Legs */}
            <line x1="435" y1="155" x2="432" y2="170" stroke="hsl(20 14% 15%)" strokeWidth="5" strokeLinecap="round" />
            <line x1="450" y1="155" x2="453" y2="170" stroke="hsl(20 14% 15%)" strokeWidth="5" strokeLinecap="round" />
            {/* Boots */}
            <ellipse cx="430" cy="172" rx="6" ry="3.5" fill="hsl(20 14% 12%)" />
            <ellipse cx="456" cy="172" rx="6" ry="3.5" fill="hsl(20 14% 12%)" />
          </g>
        </g>

        {/* ── Dwarf 3: Carrying materials (far right) ── */}
        <g className="dwarf-carrier">
          <g className="dwarf-walk">
            {/* Torso */}
            <path d="M510 128 L505 155 L540 155 L535 128 Z" fill="hsl(20 14% 15%)" />
            {/* Head */}
            <circle cx="522" cy="118" r="10" fill="hsl(20 14% 18%)" />
            {/* Simple cap */}
            <path d="M513 115 Q522 108 531 115" fill="hsl(20 14% 20%)" stroke="hsl(25 40% 25%)" strokeWidth="1" />
            {/* Beard — red */}
            <path d="M515 122 Q522 138 529 122" fill="hsl(10 40% 22%)" />
            {/* Eyes */}
            <circle cx="518" cy="116" r="1.2" fill="hsl(25 95% 53%)" className="ember-glow" />
            <circle cx="526" cy="116" r="1.2" fill="hsl(25 95% 53%)" className="ember-glow" />
            {/* Arms carrying ingot/bundle */}
            <line x1="510" y1="135" x2="500" y2="128" stroke="hsl(20 14% 15%)" strokeWidth="4" strokeLinecap="round" />
            <line x1="535" y1="135" x2="545" y2="128" stroke="hsl(20 14% 15%)" strokeWidth="4" strokeLinecap="round" />
            {/* Glowing ingot being carried overhead */}
            <rect x="498" y="120" width="50" height="10" rx="2" fill="hsl(20 14% 20%)" className="dwarf-ingot" />
            <rect x="502" y="122" width="42" height="6" rx="1" fill="hsl(25 80% 40%)" opacity="0.5" className="ember-glow" />
            {/* Legs walking */}
            <line x1="515" y1="155" x2="510" y2="170" stroke="hsl(20 14% 15%)" strokeWidth="5" strokeLinecap="round" className="dwarf-leg-left" />
            <line x1="530" y1="155" x2="535" y2="170" stroke="hsl(20 14% 15%)" strokeWidth="5" strokeLinecap="round" className="dwarf-leg-right" />
            {/* Boots */}
            <ellipse cx="508" cy="172" rx="6" ry="3.5" fill="hsl(20 14% 12%)" className="dwarf-leg-left" />
            <ellipse cx="538" cy="172" rx="6" ry="3.5" fill="hsl(20 14% 12%)" className="dwarf-leg-right" />
          </g>
        </g>

        {/* ── Scattered tools and details ── */}
        {/* Barrel */}
        <ellipse cx="50" cy="165" rx="15" ry="10" fill="hsl(20 14% 12%)" />
        <rect x="35" y="150" width="30" height="15" rx="3" fill="hsl(25 20% 14%)" stroke="hsl(25 30% 20%)" strokeWidth="0.5" />
        {/* Tool rack on wall */}
        <line x1="470" y1="70" x2="470" y2="100" stroke="hsl(20 14% 15%)" strokeWidth="2" />
        <line x1="462" y1="75" x2="478" y2="75" stroke="hsl(20 14% 18%)" strokeWidth="1.5" />
        <line x1="465" y1="85" x2="475" y2="85" stroke="hsl(20 14% 18%)" strokeWidth="1.5" />

        {/* Rune carvings on cave wall (subtle) */}
        <text x="30" y="60" fontSize="8" fill="hsl(25 60% 35%)" opacity="0.15" fontFamily="serif">&#x16A0;&#x16A2;&#x16A6;</text>
        <text x="550" y="55" fontSize="8" fill="hsl(25 60% 35%)" opacity="0.15" fontFamily="serif">&#x16B1;&#x16B2;&#x16B7;</text>

        {/* Ground line */}
        <line x1="0" y1="175" x2="600" y2="175" stroke="hsl(20 14% 14%)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/* ── Completion: Triumphant dwarf holding up finished work ── */
function CompletionDwarf({ className }: { className: string }) {
  return (
    <div className={`dwarf-forge-complete ${className}`}>
      <svg viewBox="0 0 200 160" className="w-full h-auto">
        <defs>
          <radialGradient id="item-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(40 96% 60%)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Radial glow behind */}
        <circle cx="100" cy="60" r="50" fill="url(#item-glow)" className="forge-pulse" />

        {/* Triumphant dwarf */}
        <g className="dwarf-triumph">
          {/* Torso */}
          <path d="M80 85 L75 115 L125 115 L120 85 Z" fill="hsl(20 14% 15%)" />
          {/* Belt + buckle */}
          <rect x="77" y="106" width="46" height="5" rx="1" fill="hsl(25 30% 18%)" />
          <rect x="97" y="104" width="8" height="9" rx="1" fill="hsl(25 60% 30%)" />
          {/* Head */}
          <circle cx="100" cy="72" r="14" fill="hsl(20 14% 18%)" />
          {/* Crown/helmet — victory style */}
          <path d="M87 68 Q100 52 113 68" fill="none" stroke="hsl(40 96% 50%)" strokeWidth="2.5" />
          <circle cx="93" cy="62" r="2" fill="hsl(40 96% 60%)" className="ember-glow" /> {/* gem */}
          <circle cx="100" cy="58" r="2.5" fill="hsl(15 90% 50%)" className="ember-glow" /> {/* gem */}
          <circle cx="107" cy="62" r="2" fill="hsl(40 96% 60%)" className="ember-glow" /> {/* gem */}
          {/* Magnificent beard */}
          <path d="M88 78 Q92 100 100 105 Q108 100 112 78" fill="hsl(25 20% 22%)" />
          <line x1="95" y1="85" x2="94" y2="100" stroke="hsl(25 30% 28%)" strokeWidth="1" />
          <line x1="100" y1="85" x2="100" y2="102" stroke="hsl(25 30% 28%)" strokeWidth="1" />
          <line x1="105" y1="85" x2="106" y2="100" stroke="hsl(25 30% 28%)" strokeWidth="1" />
          {/* Eyes — wide with pride */}
          <circle cx="95" cy="70" r="2" fill="hsl(25 95% 53%)" className="ember-glow" />
          <circle cx="105" cy="70" r="2" fill="hsl(25 95% 53%)" className="ember-glow" />
          {/* Mouth — grin under beard */}
          <path d="M95 76 Q100 80 105 76" fill="none" stroke="hsl(25 30% 35%)" strokeWidth="1" />

          {/* Arms raised triumphantly */}
          <line x1="82" y1="90" x2="65" y2="55" stroke="hsl(20 14% 15%)" strokeWidth="5" strokeLinecap="round" />
          <line x1="118" y1="90" x2="135" y2="55" stroke="hsl(20 14% 15%)" strokeWidth="5" strokeLinecap="round" />

          {/* Forged item held overhead — glowing sword/artifact */}
          <g className="forged-item-glow">
            <rect x="60" y="35" width="80" height="6" rx="3" fill="hsl(25 80% 45%)" />
            <rect x="65" y="37" width="70" height="2" rx="1" fill="hsl(40 96% 65%)" opacity="0.8" />
            {/* Runes on item */}
            <text x="80" y="40" fontSize="4" fill="hsl(40 96% 70%)" opacity="0.8" fontFamily="serif">&#x16A0; &#x16B1; &#x16A6;</text>
          </g>

          {/* Legs — planted wide */}
          <line x1="88" y1="115" x2="80" y2="140" stroke="hsl(20 14% 15%)" strokeWidth="6" strokeLinecap="round" />
          <line x1="112" y1="115" x2="120" y2="140" stroke="hsl(20 14% 15%)" strokeWidth="6" strokeLinecap="round" />
          {/* Boots */}
          <ellipse cx="77" cy="142" rx="8" ry="4" fill="hsl(20 14% 12%)" />
          <ellipse cx="123" cy="142" rx="8" ry="4" fill="hsl(20 14% 12%)" />
        </g>

        {/* Victory sparks */}
        <g className="victory-sparks">
          <circle cx="50" cy="30" r="2" fill="hsl(35 95% 55%)" />
          <circle cx="150" cy="25" r="1.5" fill="hsl(25 95% 53%)" />
          <circle cx="40" cy="50" r="1" fill="hsl(40 96% 60%)" />
          <circle cx="160" cy="45" r="1.8" fill="hsl(15 90% 50%)" />
          <circle cx="70" cy="20" r="1.2" fill="hsl(35 95% 65%)" />
          <circle cx="130" cy="18" r="1.5" fill="hsl(40 96% 55%)" />
          <circle cx="100" cy="15" r="1" fill="hsl(25 95% 60%)" />
          <circle cx="55" cy="45" r="0.8" fill="hsl(35 95% 55%)" />
          <circle cx="145" cy="40" r="1.3" fill="hsl(25 95% 53%)" />
        </g>

        {/* Ground */}
        <line x1="30" y1="148" x2="170" y2="148" stroke="hsl(20 14% 14%)" strokeWidth="1" />
      </svg>
    </div>
  );
}
