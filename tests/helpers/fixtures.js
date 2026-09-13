/**
 * Standard test fixtures for BingeLog E2E Test Suite
 */

export const mockMovieItem = {
  id: 'media_test_movie_1',
  externalId: 550,
  source: 'tmdb',
  type: 'movie',
  title: 'Fight Club',
  year: 1999,
  overview: 'An insomniac office worker and a devil-may-care soap maker form an underground fight club.',
  rating: 8.4,
  posterUrl: 'https://image.tmdb.org/t/p/w500/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/original/hZkgoQYus5vegHoetLkCJzb17zJ.jpg',
  status: 'plan_to_watch',
  totalSeasons: 0,
  totalEpisodes: 1,
  watchedEpisodesCount: 0
};

export const mockTvShowItem = {
  id: 'media_test_tv_1',
  externalId: 44458,
  source: 'tvmaze',
  type: 'tv',
  title: 'Ted Lasso',
  year: 2020,
  overview: 'An American football coach leads a British soccer team.',
  rating: 8.5,
  posterUrl: 'https://static.tvmaze.com/uploads/images/original_untouched/634/1585930.jpg',
  backdropUrl: 'https://static.tvmaze.com/uploads/images/original_untouched/634/1585930.jpg',
  status: 'plan_to_watch',
  totalSeasons: 2,
  totalEpisodes: 5,
  watchedEpisodesCount: 0,
  currentSeason: 1,
  currentEpisode: 0
};

export const mockTvEpisodes = [
  {
    id: 'media_test_tv_1_S1E1',
    mediaId: 'media_test_tv_1',
    seasonNumber: 1,
    episodeNumber: 1,
    title: 'Pilot',
    overview: 'Ted arrives in London.',
    airDate: '2020-08-14',
    runtime: 30,
    stillUrl: 'https://static.tvmaze.com/uploads/images/medium/s1e1.jpg',
    isWatched: 0
  },
  {
    id: 'media_test_tv_1_S1E2',
    mediaId: 'media_test_tv_1',
    seasonNumber: 1,
    episodeNumber: 2,
    title: 'Biscuits',
    overview: 'Ted bakes biscuits for Rebecca.',
    airDate: '2020-08-14',
    runtime: 29,
    stillUrl: 'https://static.tvmaze.com/uploads/images/medium/s1e2.jpg',
    isWatched: 0
  },
  {
    id: 'media_test_tv_1_S1E3',
    mediaId: 'media_test_tv_1',
    seasonNumber: 1,
    episodeNumber: 3,
    title: 'Trent Crimm: The Independent',
    overview: 'A cynical reporter spends the day with Ted.',
    airDate: '2020-08-14',
    runtime: 30,
    stillUrl: 'https://static.tvmaze.com/uploads/images/medium/s1e3.jpg',
    isWatched: 0
  },
  {
    id: 'media_test_tv_1_S2E1',
    mediaId: 'media_test_tv_1',
    seasonNumber: 2,
    episodeNumber: 1,
    title: 'Goodbye Earl',
    overview: 'A tragedy shakes Richmond.',
    airDate: '2021-07-23',
    runtime: 34,
    stillUrl: 'https://static.tvmaze.com/uploads/images/medium/s2e1.jpg',
    isWatched: 0
  },
  {
    id: 'media_test_tv_1_S2E2',
    mediaId: 'media_test_tv_1',
    seasonNumber: 2,
    episodeNumber: 2,
    title: 'Lavender',
    overview: 'A new player joins the squad.',
    airDate: '2021-07-30',
    runtime: 33,
    stillUrl: 'https://static.tvmaze.com/uploads/images/medium/s2e2.jpg',
    isWatched: 0
  }
];

export const mockCustomMediaItem = {
  id: 'media_custom_home_video',
  source: 'custom',
  type: 'tv',
  title: 'Family Summer Vacation 2025',
  year: 2025,
  overview: 'Private vacation tapes.',
  rating: 10,
  status: 'watching',
  totalSeasons: 1,
  totalEpisodes: 2,
  watchedEpisodesCount: 1,
  currentSeason: 1,
  currentEpisode: 1
};

export const mockCustomEpisodes = [
  {
    id: 'media_custom_home_video_S1E1',
    mediaId: 'media_custom_home_video',
    seasonNumber: 1,
    episodeNumber: 1,
    title: 'Custom Tape: Road Trip',
    overview: 'Driving out west.',
    airDate: '2025-07-01',
    runtime: 45,
    isWatched: 1,
    watchedAt: '2025-07-02T12:00:00.000Z'
  },
  {
    id: 'media_custom_home_video_S1E2',
    mediaId: 'media_custom_home_video',
    seasonNumber: 1,
    episodeNumber: 2,
    title: 'Custom Tape: Beach Day',
    overview: 'Sunny afternoon at the beach.',
    airDate: '2025-07-02',
    runtime: 50,
    isWatched: 0,
    watchedAt: null
  }
];
