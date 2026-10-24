/** What's playing on this computer, reported by the desktop app (see desktop/nowplaying.cjs). */
export type NowPlaying = { playing: boolean; app?: string; title?: string; artist?: string; album?: string; key?: string; art?: string | null };

type Bridge = { platform: string; nowPlaying: { start: () => Promise<boolean>; stop: () => Promise<void>; get: () => Promise<NowPlaying> } };

export const desktop: Bridge | undefined = (window as unknown as { afterimageDesktop?: Bridge }).afterimageDesktop;
export const nowPlayingAvailable = !!desktop && (desktop.platform === "darwin" || desktop.platform === "win32");
