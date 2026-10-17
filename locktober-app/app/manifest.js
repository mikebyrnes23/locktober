export default function manifest() {
  return {
    name: 'WinterArc',
    short_name: 'WinterArc',
    description: 'Group goal check-ins for the crew',
    start_url: '/',
    display: 'standalone',
    background_color: '#171712',
    theme_color: '#171712',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
