// Brand mark for the KeyStatic admin header. Inlines the favicon SVG so it
// renders without depending on /favicon.svg asset routing inside the admin
// SPA. The d20 polygon + italic "M" mirror the public site's identity.

type Props = {
  colorScheme: 'light' | 'dark';
};

export function BrandMark(_props: Props) {
  // The gradient is dark-on-light and reads against either header
  // background; we don't currently swap variants by colorScheme.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width="24"
      height="24"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bs-brandmark-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6E5A8A" />
          <stop offset="1" stopColor="#2A1E34" />
        </linearGradient>
      </defs>
      <polygon
        points="32,4 60,22 50,60 14,60 4,22"
        fill="url(#bs-brandmark-g)"
        stroke="#E8E4DF"
        strokeWidth="1.2"
      />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontStyle="italic"
        fontSize="18"
        fill="#E8E4DF"
      >
        M
      </text>
    </svg>
  );
}
