import type { AvatarPresetId } from '@vmw/contracts';

export interface ChibiPresetMeta {
  id: AvatarPresetId;
  gender: 'NAM' | 'NỮ';
  genderLabel: string;
  name: string;
  outfitTitle: string;
  desc: string;
  body: string;
  accent: string;
}

export const CHIBI_PRESET_CATALOG: ChibiPresetMeta[] = [
  {
    id: 'chibi-classic',
    gender: 'NAM',
    genderLabel: '👦 Outfit Nam 1',
    name: 'Nam • Street Casual',
    outfitTitle: 'Áo Raglan & Short Jean',
    desc: 'Tóc nâu tỉa mái có chỏm ahoge, áo thun raglan tay xanh navy, quần short jean & giày sneaker.',
    body: '#9a6544',
    accent: '#355b82',
  },
  {
    id: 'chibi-synth',
    gender: 'NAM',
    genderLabel: '👦 Outfit Nam 2',
    name: 'Nam • Producer Hoodie',
    outfitTitle: 'Hoodie Streetwear & Tai Nghe',
    desc: 'Tóc tím khói năng động, tai nghe phòng thu phát sáng cyan, áo hoodie rộng & quần jogger đen.',
    body: '#4f46e5',
    accent: '#38bdf8',
  },
  {
    id: 'chibi-acoustic',
    gender: 'NỮ',
    genderLabel: '👧 Outfit Nữ 1',
    name: 'Nữ • Mơ Mật Ong',
    outfitTitle: 'Áo Tay Phồng & Váy Yếm',
    desc: 'Tóc caramel búi đôi buộc nơ hồng đào, áo blouse kem tay phồng & chân váy yếm vàng mật ong.',
    body: '#e59a5c',
    accent: '#f2b544',
  },
  {
    id: 'chibi-strings',
    gender: 'NỮ',
    genderLabel: '👧 Outfit Nữ 2',
    name: 'Nữ • Dâu Tây Thủy Thủ',
    outfitTitle: 'Áo Thủy Thủ & Mũ Beret Đỏ',
    desc: 'Tóc bob nâu trầm đội mũ nồi đỏ dâu, áo thủy thủ thắt nơ đỏ, chân váy xếp ly & tất cao cổ.',
    body: '#2c3d6e',
    accent: '#e2425c',
  },
];

/**
 * Cute full-body 2D Anime Chibi SVG preview matching the exact 3D outfit geometry in chibiCharacterKit.ts.
 */
export function ChibiPresetAvatarSvg({
  presetId,
  className = 'h-24 w-24',
}: {
  presetId: AvatarPresetId;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 120 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Soft Ground Shadow */}
      <ellipse cx="60" cy="131" rx="24" ry="5" fill="rgba(0,0,0,0.35)" />

      {/* Back Hair / Twin Buns / Beret */}
      {presetId === 'chibi-acoustic' && (
        <>
          <circle cx="29" cy="31" r="12" fill="#b8703c" stroke="#2b1d22" strokeWidth="3" />
          <circle cx="91" cy="31" r="12" fill="#b8703c" stroke="#2b1d22" strokeWidth="3" />
          <ellipse cx="33" cy="36" rx="5" ry="2.5" fill="#fb7185" />
          <ellipse cx="87" cy="36" rx="5" ry="2.5" fill="#fb7185" />
        </>
      )}
      {presetId === 'chibi-strings' && (
        <>
          <path
            d="M30 48 C26 64, 30 76, 40 78 L80 78 C90 76, 94 64, 90 48 Z"
            fill="#241820"
            stroke="#2b1d22"
            strokeWidth="3"
          />
          {/* Red Beret */}
          <ellipse cx="66" cy="22" rx="28" ry="11" transform="rotate(-10 66 22)" fill="#e2425c" stroke="#2b1d22" strokeWidth="3" />
          <path d="M68 10 L71 15" stroke="#2b1d22" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {presetId === 'chibi-classic' && (
        /* Ahoge cowlick */
        <path
          d="M60 15 C64 6, 72 9, 66 18"
          fill="#9a6544"
          stroke="#2b1d22"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}

      {/* Legs & Socks */}
      {presetId === 'chibi-synth' ? (
        /* Male 2: Dark Cargo Joggers with Cyan Cuffs */
        <>
          <rect x="44" y="96" width="13" height="25" rx="6" fill="#2a2a35" stroke="#2b1d22" strokeWidth="3" />
          <rect x="63" y="96" width="13" height="25" rx="6" fill="#2a2a35" stroke="#2b1d22" strokeWidth="3" />
          <rect x="45" y="116" width="11" height="4" fill="#38bdf8" />
          <rect x="64" y="116" width="11" height="4" fill="#38bdf8" />
        </>
      ) : (
        <>
          <rect x="46" y="98" width="10" height="23" rx="5" fill="#ffe2cf" stroke="#2b1d22" strokeWidth="2.8" />
          <rect x="64" y="98" width="10" height="23" rx="5" fill="#ffe2cf" stroke="#2b1d22" strokeWidth="2.8" />
          {/* Socks */}
          <rect
            x="46"
            y={presetId === 'chibi-strings' ? 105 : 112}
            width="10"
            height={presetId === 'chibi-strings' ? 15 : 8}
            fill="#ffffff"
          />
          <rect
            x="64"
            y={presetId === 'chibi-strings' ? 105 : 112}
            width="10"
            height={presetId === 'chibi-strings' ? 15 : 8}
            fill="#ffffff"
          />
        </>
      )}

      {/* Shoes */}
      <ellipse
        cx="50"
        cy="124"
        rx="8.5"
        ry="5.5"
        fill={presetId === 'chibi-synth' ? '#f8fafc' : presetId === 'chibi-acoustic' ? '#8b4a2b' : '#27272a'}
        stroke="#2b1d22"
        strokeWidth="2.8"
      />
      <ellipse
        cx="70"
        cy="124"
        rx="8.5"
        ry="5.5"
        fill={presetId === 'chibi-synth' ? '#f8fafc' : presetId === 'chibi-acoustic' ? '#8b4a2b' : '#27272a'}
        stroke="#2b1d22"
        strokeWidth="2.8"
      />

      {/* Arms */}
      <path
        d="M39 74 L30 92"
        stroke={presetId === 'chibi-synth' ? '#6d5bd0' : presetId === 'chibi-classic' ? '#355b82' : '#ffe2cf'}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M81 74 L90 92"
        stroke={presetId === 'chibi-synth' ? '#6d5bd0' : presetId === 'chibi-classic' ? '#355b82' : '#ffe2cf'}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle cx="29" cy="94" r="5" fill="#ffe2cf" stroke="#2b1d22" strokeWidth="2.5" />
      <circle cx="91" cy="94" r="5" fill="#ffe2cf" stroke="#2b1d22" strokeWidth="2.5" />

      {/* Torso & Bottom Outfit */}
      {presetId === 'chibi-classic' && (
        /* Male 1: Raglan Tee + Denim Shorts */
        <>
          <rect x="42" y="90" width="16" height="15" rx="3" fill="#4f79ad" stroke="#2b1d22" strokeWidth="2.8" />
          <rect x="62" y="90" width="16" height="15" rx="3" fill="#4f79ad" stroke="#2b1d22" strokeWidth="2.8" />
          <path d="M40 68 L80 68 L82 93 L38 93 Z" rx="6" fill="#fbfbf7" stroke="#2b1d22" strokeWidth="3" />
          <path d="M40 68 L50 68 L42 82 L36 77 Z" fill="#355b82" />
          <path d="M80 68 L70 68 L78 82 L84 77 Z" fill="#355b82" />
        </>
      )}

      {presetId === 'chibi-synth' && (
        /* Male 2: Oversized Cyber Hoodie */
        <>
          <rect x="37" y="67" width="46" height="31" rx="9" fill="#6d5bd0" stroke="#2b1d22" strokeWidth="3" />
          <rect x="45" y="85" width="30" height="9" rx="3" fill="#5b4bc0" />
          <line x1="54" y1="70" x2="54" y2="81" stroke="#f5f3ff" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="66" y1="70" x2="66" y2="81" stroke="#f5f3ff" strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}

      {presetId === 'chibi-acoustic' && (
        /* Female 1: Cream Puff Blouse + Honey Flared Skirt */
        <>
          <path d="M39 68 L81 68 L80 86 L40 86 Z" fill="#fff6e5" stroke="#2b1d22" strokeWidth="2.8" />
          <path d="M38 84 L82 84 L89 104 L31 104 Z" fill="#f2b544" stroke="#2b1d22" strokeWidth="3" />
          <circle cx="60" cy="74" r="4" fill="#fb7185" />
        </>
      )}

      {presetId === 'chibi-strings' && (
        /* Female 2: White Sailor Top + Red Bow + Navy Pleated Skirt */
        <>
          <path d="M39 68 L81 68 L80 86 L40 86 Z" fill="#ffffff" stroke="#2b1d22" strokeWidth="2.8" />
          <path d="M44 68 L60 79 L76 68" fill="none" stroke="#2c3d6e" strokeWidth="4" />
          <path d="M53 76 L67 76 L60 83 Z" fill="#e2425c" />
          <path d="M38 85 L82 85 L88 104 L32 104 Z" fill="#2c3d6e" stroke="#2b1d22" strokeWidth="3" />
        </>
      )}

      {/* Big Mochi Chibi Head */}
      <ellipse cx="60" cy="46" rx="28" ry="24" fill="#ffe2cf" stroke="#2b1d22" strokeWidth="3.2" />

      {/* Hair Bangs & Cap */}
      <path
        d="M32 44 C30 22, 46 16, 60 16 C74 16, 90 22, 88 44 C82 34, 74 42, 66 35 C58 43, 49 42, 43 35 C38 41, 34 39, 32 44 Z"
        fill={
          presetId === 'chibi-classic'
            ? '#9a6544'
            : presetId === 'chibi-acoustic'
              ? '#e59a5c'
              : presetId === 'chibi-synth'
                ? '#b8a2f7'
                : '#3d2b33'
        }
        stroke="#2b1d22"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Cyan Studio Headphones on Male 2 (chibi-synth) */}
      {presetId === 'chibi-synth' && (
        <>
          <rect x="26" y="38" width="8" height="15" rx="4" fill="#38bdf8" stroke="#2b1d22" strokeWidth="2.5" />
          <rect x="86" y="38" width="8" height="15" rx="4" fill="#38bdf8" stroke="#2b1d22" strokeWidth="2.5" />
        </>
      )}

      {/* Sparkly Anime Eyes */}
      <ellipse cx="48" cy="49" rx="4.8" ry="6" fill="#2b1d22" />
      <ellipse cx="72" cy="49" rx="4.8" ry="6" fill="#2b1d22" />
      <circle cx="49.5" cy="46.8" r="2" fill="#ffffff" />
      <circle cx="73.5" cy="46.8" r="2" fill="#ffffff" />

      {/* Rosy Cheeks & Cute Cat Mouth */}
      <ellipse cx="40" cy="55" rx="4.5" ry="2.2" fill="#ff9fb2" opacity="0.85" />
      <ellipse cx="80" cy="55" rx="4.5" ry="2.2" fill="#ff9fb2" opacity="0.85" />
      <path
        d="M56 55 Q58 58 60 55 Q62 58 64 55"
        stroke="#6b2f2f"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
