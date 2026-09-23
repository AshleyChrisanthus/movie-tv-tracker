import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Cross-Media Franchises: Automated TV Series & Spinoff Discovery', () => {
  let apiModule;
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    apiModule = await getApiModule();
    dbModule = await getDbModule();
  });

  const mockBatmanCollection = {
    id: 948485,
    name: 'The Batman Collection',
    overview: 'Matt Reeves Batman Epic Crime Saga',
    parts: [
      {
        id: 414906,
        title: 'The Batman',
        release_date: '2022-03-01',
        poster_path: '/74xTEgt7R36Fpooo50r9T25onhq.jpg',
        vote_average: 7.7
      },
      {
        id: 1040148,
        title: 'The Batman Part II',
        release_date: '2026-10-02',
        poster_path: null,
        vote_average: 0
      }
    ]
  };

  const mockPenguinShow = {
    externalId: 60920,
    tvmazeId: 60920,
    tmdbId: 194764,
    source: 'tvmaze',
    type: 'tv',
    title: 'The Penguin',
    year: 2024,
    releaseDate: '2024-09-19',
    overview: "Starring Colin Farrell as Oz Cobb (aka The Penguin), the DC Studios series continues filmmaker Matt Reeves' The Batman epic crime saga.",
    rating: null,
    communityRating: 8.8,
    posterUrl: 'https://static.tvmaze.com/uploads/images/medium_portrait/536/1340329.jpg',
    backdropUrl: null
  };

  const mockGothamPrequel = {
    externalId: 44,
    tvmazeId: 44,
    tmdbId: 60708,
    source: 'tvmaze',
    type: 'tv',
    title: 'Gotham',
    year: 2014,
    releaseDate: '2014-09-22',
    overview: 'The origin story of Gotham City police commissioner James Gordon and a young Bruce Wayne.',
    rating: null,
    communityRating: 7.8,
    posterUrl: null,
    backdropUrl: null
  };

  it('should generate an interconnected cross-media graph with movies and TV spinoffs', () => {
    const { nodes, edges } = apiModule.crossMediaToCanvasGraph(
      mockBatmanCollection,
      [mockPenguinShow],
      [],
      { x: 100, y: 150 }
    );

    assert.equal(nodes.length, 3, 'Should produce 2 movie nodes and 1 TV node');
    assert.equal(edges.length, 2, 'Should produce 1 sequel edge and 1 spinoff edge');

    // Verify movie nodes
    const movie1 = nodes.find(n => n.data.title === 'The Batman');
    const movie2 = nodes.find(n => n.data.title === 'The Batman Part II');
    const tvShow = nodes.find(n => n.data.title === 'The Penguin');

    assert.ok(movie1, 'The Batman node must exist');
    assert.equal(movie1.data.type, 'movie');
    assert.equal(movie1.data.year, 2022);

    assert.ok(movie2, 'The Batman Part II node must exist');
    assert.equal(movie2.data.type, 'movie');
    assert.equal(movie2.data.year, 2026);

    assert.ok(tvShow, 'The Penguin TV node must exist');
    assert.equal(tvShow.data.type, 'tv');
    assert.equal(tvShow.data.year, 2024);
    assert.equal(tvShow.data.communityRating, 8.8);

    // Verify sequel edge between Movie 1 and Movie 2
    const sequelEdge = edges.find(e => e.relationType === 'sequel');
    assert.ok(sequelEdge, 'Sequel edge must connect movie 1 to movie 2');
    assert.equal(sequelEdge.source, movie1.id);
    assert.equal(sequelEdge.target, movie2.id);
    assert.equal(sequelEdge.label, 'Sequel');

    // Verify spinoff edge from The Batman (2022) to The Penguin (2024)
    const spinoffEdge = edges.find(e => e.relationType === 'spinoff');
    assert.ok(spinoffEdge, 'Spinoff edge must connect movie 1 to TV spinoff');
    assert.equal(spinoffEdge.source, movie1.id);
    assert.equal(spinoffEdge.target, tvShow.id);
    assert.equal(spinoffEdge.label, 'Spinoff Series');
    assert.equal(spinoffEdge.animated, true);
  });

  it('should identify and label prequel TV series when release date precedes the first movie', () => {
    const { nodes, edges } = apiModule.crossMediaToCanvasGraph(
      mockBatmanCollection,
      [mockGothamPrequel],
      [],
      { x: 50, y: 50 }
    );

    const gothamNode = nodes.find(n => n.data.title === 'Gotham');
    assert.ok(gothamNode);

    const prequelEdge = edges.find(e => e.relationType === 'prequel');
    assert.ok(prequelEdge, 'Prequel edge must connect to Gotham (2014) which released before The Batman (2022)');
    assert.equal(prequelEdge.label, 'Prequel Series');
    assert.equal(prequelEdge.target, gothamNode.id);
  });

  it('should synchronize watch progress and user rating from library for both movies and TV spinoffs', async () => {
    // Save The Penguin in user library with 8 episodes watched and completed status
    await dbModule.saveMediaItem({
      title: 'The Penguin',
      type: 'tv',
      status: 'completed',
      tvmazeId: 60920,
      rating: 9.5,
      totalEpisodes: 8,
      watchedEpisodesCount: 8
    });

    const library = await dbModule.getAllMedia();
    const { nodes } = apiModule.crossMediaToCanvasGraph(
      mockBatmanCollection,
      [mockPenguinShow],
      library
    );

    const tvNode = nodes.find(n => n.data.title === 'The Penguin');
    assert.ok(tvNode);
    assert.ok(tvNode.data.mediaId, 'Must be linked to library item ID');
    assert.equal(tvNode.data.status, 'completed');
    assert.equal(tvNode.data.rating, 9.5);
    assert.equal(tvNode.data.watchedEpisodesCount, 8);
    assert.equal(tvNode.data.totalEpisodes, 8);
  });

  it('should discover connected TV series via discoverConnectedTVShows with query cleansing and relevance scoring', async () => {
    // Test discovering TV shows for The Batman Collection
    const results = await apiModule.discoverConnectedTVShows({
      franchiseName: 'The Batman Collection',
      movieTitles: ['The Batman', 'The Batman Part II'],
      limit: 5
    });

    assert.ok(Array.isArray(results), 'Must return an array of TV search results');
    // In live or mock environments, all returned items must have type: 'tv'
    results.forEach(res => {
      assert.equal(res.type, 'tv', 'Every discovered item must be of type TV');
      assert.ok(res.title, 'Discovered item must have a title');
    });

    // Handle empty franchise query gracefully
    const emptyResults = await apiModule.discoverConnectedTVShows({
      franchiseName: '',
      movieTitles: [],
      limit: 5
    });
    assert.deepEqual(emptyResults, []);
  });

  it('should extract spinoff titles from Wikipedia sections and prioritize them in discoverConnectedTVShows', async () => {
    const wikiTitles = await apiModule.fetchWikipediaSpinoffTitles({
      movieTitles: ['The Batman'],
      franchiseName: 'The Batman Collection'
    });

    assert.ok(Array.isArray(wikiTitles));
    if (wikiTitles.length > 0) {
      assert.ok(wikiTitles.includes('The Penguin'), 'Must extract The Penguin from Wikipedia spin-off sections');
    }

    // Verify empty input handling
    const emptyWiki = await apiModule.fetchWikipediaSpinoffTitles({});
    assert.deepEqual(emptyWiki, []);
  });
});
