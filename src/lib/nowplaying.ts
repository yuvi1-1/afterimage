/** What's playing on this computer, reported by the desktop app (see desktop/nowplaying.cjs). */
export type NowPlaying = { playing: boolean; app?: string; title?: string; artist?: string; album?: string; key?: string; art?: string | null; artId?: number; artSame?: boolean };

type Bridge = { platform: string; nowPlaying: { start: () => Promise<boolean>; stop: () => Promise<void>; get: (haveArtId?: number) => Promise<NowPlaying> }; openAudioPermission?: () => Promise<boolean> };

export const desktop: Bridge | undefined = (window as unknown as { afterimageDesktop?: Bridge }).afterimageDesktop;
export const nowPlayingAvailable = !!desktop && (desktop.platform === "darwin" || desktop.platform === "win32");
