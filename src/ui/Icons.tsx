const I = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export const Icon = {
  play: () => <I fill d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />,
  pause: () => <I fill d="M6 4h4v16H6zM14 4h4v16h-4z" />,
  grid: () => <I d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  palette: () => <I d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 11.5h.01" />,
  sliders: () => <I d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />,
  bank: () => <I d="M4 5h16M4 12h16M4 19h16M8 3v4M16 10v4M11 17v4" />,
  rec: () => <I fill d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />,
  stop: () => <I fill d="M6 6h12v12H6z" />,
  screen: () => <I d="M3 5h18v11H3zM8 20h8M12 16v4" />,
  full: () => <I d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  help: () => <I d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.5-1.5 1.1-1.5 2.1v.4M12 17.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />,
  dice: () => <I d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" />,
  music: () => <I d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />,
  mic: () => <I d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />,
  speaker: () => <I d="M4 9h4l5-4v14l-5-4H4zM17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />,
  spark: () => <I d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
  image: () => <I d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9h.01" />,
  camera: () => <I d="M3 7h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  knob: () => <I d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 12l4-4" />,
  x: () => <I d="M6 6l12 12M18 6L6 18" />,
  undo: () => <I d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  still: () => <I d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  lock: () => <I d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />,
  wave: () => <I d="M2 12c2 0 2-6 4-6s2 12 4 12 2-12 4-12 2 12 4 12 2-6 4-6" />,
  eye: () => <I d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
};
