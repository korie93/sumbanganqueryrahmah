import type { CSSProperties } from "react";

// Mechanically converted from the supplied FINAL SVG. Keep geometry and paint intact.
// One illustration is mounted by the General Search result boundary.
export function GeneralSearchEmptyIllustration() {
  return (
    <svg viewBox="0 0 360 220" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sqrV3Water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="g-top"/>
          <stop offset="1" className="g-bottom"/>
        </linearGradient>
        <linearGradient id="sqrV3Sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="s-top"/>
          <stop offset="1" className="s-bottom"/>
        </linearGradient>
        <radialGradient id="sqrV3Glow">
          <stop offset="0" className="glow-a"/>
          <stop offset="1" className="glow-b"/>
        </radialGradient>
        <radialGradient id="sqrV3Lamp">
          <stop offset="0" className="lamp-a"/>
          <stop offset="1" className="lamp-b"/>
        </radialGradient>
        <mask id="sqrV3Moon">
          <rect x="-50" y="-50" width="460" height="320" fill="#fff"/>
          <circle cx="283" cy="39" r="12" fill="#000"/>
        </mask>
        <clipPath id="sqrV3WaterClip"><rect x="0" y="134" width="360" height="86"/></clipPath>

        {/* V7: organic scenery gradients. New static paint only; original motion untouched. */}
        <radialGradient id="sqrV7Lagoon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--e-water-top)" stopOpacity=".58"/>
          <stop offset="55%" stopColor="var(--e-water-bottom)" stopOpacity=".34"/>
          <stop offset="87%" stopColor="var(--e-water-bottom)" stopOpacity=".10"/>
          <stop offset="100%" stopColor="var(--e-water-bottom)" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="sqrV7Hills" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="var(--e-hill-far)" stopOpacity=".31"/>
          <stop offset="70%" stopColor="var(--e-hill-far)" stopOpacity=".12"/>
          <stop offset="100%" stopColor="var(--e-hill-far)" stopOpacity="0"/>
        </radialGradient>

      </defs>
      {/* V7: natural-edged atmosphere; no flat rectangular sky or water panels. */}
      <g className="sqr-v7-landscape" aria-hidden="true">
        <ellipse cx="228" cy="137" rx="153" ry="53" fill="url(#sqrV7Hills)"/>
        <path d="M76 137 Q110 113 136 124 Q157 109 180 121 Q218 103 248 120 Q276 113 318 137 Q265 128 238 139 Q171 132 133 144Z" fill="var(--e-hill-near)" opacity=".14"/>
        <ellipse cx="188" cy="160" rx="179" ry="66" fill="url(#sqrV7Lagoon)"/>
        <ellipse cx="226" cy="174" rx="114" ry="24" fill="url(#sqrV7Lagoon)" opacity=".36"/>
      </g>


      {/* Sky: night in dark theme, day in light theme */}
      <rect x="0" y="0" width="360" height="140" fill="url(#sqrV3Sky)"/>
      <circle cx="276" cy="44" r="42" fill="url(#sqrV3Glow)"/>
      <g className="night-only">
        <circle className="star" cx="40"  cy="30" r="1.4" fill="var(--e-star)"/>
        <circle className="star" cx="95"  cy="18" r="1.1" fill="var(--e-star)"/>
        <circle className="star" cx="150" cy="40" r="1.5" fill="var(--e-star)"/>
        <circle className="star" cx="210" cy="20" r="1.1" fill="var(--e-star)"/>
        <circle className="star" cx="236" cy="62" r="1.3" fill="var(--e-star)"/>
        <circle className="star" cx="326" cy="72" r="1.2" fill="var(--e-star)"/>
      </g>
      <circle className="night-only" cx="276" cy="44" r="14" fill="var(--e-moon)" mask="url(#sqrV3Moon)"/>
      <g className="day-only">
        <g className="rays" stroke="var(--e-moon)" strokeWidth="2" strokeLinecap="round">
          <path d="M295 44h5M289.4 57.4l3.6 3.6M276 63v5M262.6 57.4 259 61M257 44h-5M262.6 30.6 259 27M276 25v-5M289.4 30.6 293 27"/>
        </g>
        <circle cx="276" cy="44" r="13" fill="var(--e-moon)"/>
      </g>
      <g className="cloud">
        <rect x="70" y="52" width="62" height="10" rx="5" fill="var(--e-cloud)"/>
        <rect x="86" y="44" width="34" height="10" rx="5" fill="var(--e-cloud)"/>
      </g>

      {/* Distant hills */}
      <path d="M0 136V112Q30 96 62 108T130 104T200 112T270 100T360 110V136z" fill="var(--e-hill-far)"/>
      <path d="M318 112l-6 16h12zM330 108l-7 20h14zM343 113l-5 15h10z" fill="var(--e-hill-near)" opacity=".85"/>
      <path d="M0 136V123Q40 113 80 121T170 119T260 115T360 121V136z" fill="var(--e-hill-near)"/>

      {/* Water (back layer) */}
      <rect x="0" y="134" width="360" height="86" fill="url(#sqrV3Water)"/>

      {/* Dock */}
      <rect x="22"  y="120" width="7" height="46" rx="2" fill="var(--e-dock-dark)"/>
      <rect x="148" y="120" width="7" height="46" rx="2" fill="var(--e-dock-dark)"/>
      <rect x="0" y="112" width="176" height="9" rx="2" fill="var(--e-dock)"/>
      <path d="M0 116.5h176" stroke="var(--e-dock-dark)" strokeWidth="1" opacity=".5"/>

      {/* Lantern: one warm light that ties the dock, bucket, fisher and water together */}
      <circle className="lamp-glow night-only" cx="122" cy="104" r="56" fill="url(#sqrV3Lamp)"/>
      <path d="M119 101q3.5-7 7 0" fill="none" stroke="var(--e-bucket)" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="118" y="101" width="9" height="11" rx="2" fill="var(--e-boot)"/>
      <rect className="lamp-core" x="119.8" y="103" width="5.4" height="7" rx="1.4" fill="var(--e-lamp)"/>

      {/* Empty bucket */}
      <path d="M72 98h22l-3 14H75z" fill="var(--e-bucket)"/>
      <ellipse cx="83" cy="98" rx="11" ry="2.6" fill="var(--e-bucket-in)"/>
      <path d="M74 98q9-15 18 0" fill="none" stroke="var(--e-bucket)" strokeWidth="1.6" strokeLinecap="round"/>

      {/* Fisher + rod + line + bobber: ONE rigid group, so a tug on the line moves the whole person */}
      <g id="sqrV3Fisher" className="fisher">
        <rect className="leg" x="168" y="106" width="8" height="30" rx="4" fill="var(--e-boot)"/>
        <rect className="torso" x="146" y="82" width="24" height="31" rx="10" fill="var(--e-shirt)"/>
        <path d="M168.5 87q2.5 9-.5 21" fill="none" stroke="var(--e-rim)" strokeWidth="1.6" strokeLinecap="round"/>
        <path className="night-only" d="M148 90q-1.5 8 .5 17" fill="none" stroke="var(--e-lamp)" strokeWidth="1.6" strokeLinecap="round" opacity=".55"/>
        <g className="head">
          <circle cx="158" cy="70" r="9" fill="var(--e-skin)"/>
          <path d="M147 68a11 11 0 0 1 22 0z" fill="var(--e-hat)"/>
          <rect x="144" y="66.5" width="28" height="3" rx="1.5" fill="var(--e-hat)"/>
          <circle cx="162" cy="71" r="1" fill="#2a2a2a"/>
        </g>
        <path d="M164 92l16 6" stroke="var(--e-shirt)" strokeWidth="6" strokeLinecap="round"/>
        <g className="rig">
          <path d="M181 98Q228 62 252 40" fill="none" stroke="var(--e-rod)" strokeWidth="2.6" strokeLinecap="round"/>
          <line className="line" x1="252" y1="40" x2="252" y2="134" stroke="var(--e-line)" strokeWidth="1"/>
          <g className="bobber">
            <circle cx="252" cy="134" r="5.5" fill="var(--e-bobber)"/>
            <path d="M246.5 134a5.5 5.5 0 0 0 11 0z" fill="var(--e-bobber-2)"/>
          </g>
        </g>
        <circle cx="181" cy="98" r="3" fill="var(--e-skin)"/>
      </g>

      {/* Fish live under the surface, so they are drawn before the front water layer */}
      <g className="fish-deep">
        <path d="M-9 0C-5-5 4-5 7 0C4 5-5 5-9 0z" fill="var(--e-fish-deep)"/>
        <path className="tail" d="M6 0L13-4.5V4.5z" fill="var(--e-fish-deep)"/>
      </g>
      <g className="fish-main">
        <path d="M-15 0C-9-8 6-8 11 0C6 8-9 8-15 0z" fill="var(--e-fish)"/>
        <path d="M-4-6.4 1-10.5 5-5.6z" fill="var(--e-fish)" opacity=".75"/>
        <path className="tail" d="M10 0L21-7V7z" fill="var(--e-fish)"/>
        <circle cx="-9" cy="-1.5" r="1.4" fill="#1a1a1a"/>
        <path d="M-2-5q4 5 0 10" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="1.2" strokeLinecap="round"/>
      </g>

      {/* Water (front layer: dims everything below the surface) */}
      <rect x="0" y="134" width="360" height="86" fill="url(#sqrV3Water)" opacity=".42"/>
      <g>
        <path className="wave" d="M20 150q10-4 20 0t20 0" fill="none" stroke="var(--e-wave)" strokeWidth="1.4" strokeLinecap="round"/>
        <path className="wave" d="M200 160q10-4 20 0t20 0" fill="none" stroke="var(--e-wave)" strokeWidth="1.4" strokeLinecap="round"/>
        <path className="wave" d="M90 186q10-4 20 0t20 0" fill="none" stroke="var(--e-wave)" strokeWidth="1.4" strokeLinecap="round"/>
      </g>
      <path d="M0 134.5h360" stroke="var(--e-wave)" strokeWidth="1"/>

      {/* Reflections */}
      <g clipPath="url(#sqrV3WaterClip)">
        <g className="refl" opacity=".2">
          <use href="#sqrV3Fisher" transform="translate(0 268) scale(1 -1)"/>
        </g>
      </g>
      <g>
        <rect className="shimmer" x="268"   y="148" width="16" height="2.2" rx="1.1" fill="var(--e-moon)" opacity=".3"/>
        <rect className="shimmer" x="271"   y="158" width="10" height="2.2" rx="1.1" fill="var(--e-moon)" opacity=".25"/>
        <rect className="shimmer" x="273.5" y="168" width="5"  height="2.2" rx="1.1" fill="var(--e-moon)" opacity=".2"/>
      </g>
      <g className="night-only">
        <rect className="lamp-shimmer" x="112" y="142" width="20" height="2.4" rx="1.2" fill="var(--e-lamp)" opacity=".45"/>
        <rect className="lamp-shimmer" x="115" y="152" width="14" height="2.4" rx="1.2" fill="var(--e-lamp)" opacity=".35"/>
        <rect className="lamp-shimmer" x="118" y="162" width="8"  height="2.4" rx="1.2" fill="var(--e-lamp)" opacity=".25"/>
      </g>

      {/* Ripples: fired by the story (idle bob, two nibbles, the hook-set, settling), not on a loose timer */}
      <g>
        <ellipse className="ring" cx="252" cy="135" rx="6" ry="1.6" fill="none" stroke="var(--e-ripple)" strokeWidth="1"/>
        <ellipse className="ring" cx="252" cy="135" rx="6" ry="1.6" fill="none" stroke="var(--e-ripple)" strokeWidth="1"/>
        <ellipse className="ring" cx="252" cy="135" rx="6" ry="1.6" fill="none" stroke="var(--e-ripple)" strokeWidth="1"/>
        <ellipse className="ring" cx="252" cy="135" rx="6" ry="1.6" fill="none" stroke="var(--e-ripple)" strokeWidth="1.2"/>
        <ellipse className="ring" cx="252" cy="135" rx="6" ry="1.6" fill="none" stroke="var(--e-ripple)" strokeWidth="1"/>
      </g>

      {/* Splash droplets: nibble, nibble, hook-set */}
      <g fill="var(--e-ripple)">
        <circle className="drop" cx="252" cy="132" r="1.6" style={{ "--dx": "-9px", "--dy": "-13px" } as CSSProperties}/>
        <circle className="drop" cx="252" cy="132" r="1.3" style={{ "--dx": "-3px", "--dy": "-17px" } as CSSProperties}/>
        <circle className="drop" cx="252" cy="132" r="1.5" style={{ "--dx": "5px", "--dy": "-16px" } as CSSProperties}/>
        <circle className="drop" cx="252" cy="132" r="1.2" style={{ "--dx": "10px", "--dy": "-11px" } as CSSProperties}/>
      </g>

      {/* Bubble trail left behind when the fish darts away */}
      <g fill="var(--e-bubble)">
        <circle className="trail" cx="238" cy="163" r="1.8"/>
        <circle className="trail" cx="217" cy="168" r="1.5"/>
        <circle className="trail" cx="196" cy="171" r="1.2"/>
      </g>

      {/* Ambient bubbles */}
      <g>
        <circle className="bubble" cx="110" cy="206" r="2.2" fill="var(--e-bubble)"/>
        <circle className="bubble" cx="190" cy="202" r="1.8" fill="var(--e-bubble)"/>
        <circle className="bubble" cx="250" cy="208" r="2.4" fill="var(--e-bubble)"/>
      </g>

      {/* Fireflies (night only) */}
      <g className="night-only">
        <g className="firefly"><circle cx="60"  cy="86" r="4.5" fill="var(--e-firefly)" opacity=".16"/><circle cx="60"  cy="86" r="1.5" fill="var(--e-firefly)"/></g>
        <g className="firefly"><circle cx="104" cy="80" r="4.5" fill="var(--e-firefly)" opacity=".16"/><circle cx="104" cy="80" r="1.5" fill="var(--e-firefly)"/></g>
        <g className="firefly"><circle cx="214" cy="100" r="4.5" fill="var(--e-firefly)" opacity=".16"/><circle cx="214" cy="100" r="1.5" fill="var(--e-firefly)"/></g>
      </g>

      {/* Thought dots: "waiting..." (calm phases) */}
      <g className="wait" fill="var(--e-line)">
        <circle cx="172" cy="52" r="1.9"/>
        <circle cx="179" cy="48" r="1.9"/>
        <circle cx="186" cy="44" r="1.9"/>
      </g>

      {/* "!" over the fisher's head (bite phase) */}
      <g className="alert">
        <circle cx="178" cy="44" r="9" fill="var(--e-alert)"/>
        <rect x="176.8" y="38.5" width="2.4" height="7" rx="1.2" fill="#3a2a00"/>
        <circle cx="178" cy="48.8" r="1.4" fill="#3a2a00"/>
      </g>
    </svg>
  );
}
