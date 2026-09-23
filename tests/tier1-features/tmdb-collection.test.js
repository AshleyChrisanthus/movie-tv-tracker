import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiModule, getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: TMDB Collection / Franchise Timeline Graph', () => {
  let apiModule;
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    apiModule = await getApiModule();
    dbModule = await getDbModule();
  });

  const mockDarkKnightCollection = {
    id: 263,
    name: 'The Dark Knight Collection',
    overview: 'Christopher Nolan Batman Trilogy',
    parts: [
      {
        id: 155,
        title: 'The Dark Knight',
        release_date: '2008-07-16',
        poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
        vote_average: 8.5
      },
      {
        id: 272,
        title: 'Batman Begins',
        release_date: '2005-06-10',
        poster_path: '/8RW2runSEc3RjVz955Ky7jKNx8E.jpg',
        vote_average: 7.7
      },
      {
        id: 49026,
        title: 'The Dark Knight Rises',
        release_date: '2012-07-16',
        poster_path: '/hrJUZxLg6rE2wUvU8xRz87F7hL.jpg',
        vote_average: 7.8
      }
    ]
  };

  it('should transform a TMDB Collection into chronologically sorted canvas nodes', () => {
    const { nodes, edges } = apiModule.collectionToCanvasGraph(mockDarkKnightCollection);

    assert.equal(nodes.length, 3);
    assert.equal(edges.length, 2);

    // Verify chronological ordering by release_date
    assert.equal(nodes[0].data.title, 'Batman Begins');
    assert.equal(nodes[0].data.year, 2005);
    assert.equal(nodes[1].data.title, 'The Dark Knight');
    assert.equal(nodes[1].data.year, 2008);
    assert.equal(nodes[2].data.title, 'The Dark Knight Rises');
    assert.equal(nodes[2].data.year, 2012);

    // Verify edges connect node 0 -> 1 and node 1 -> 2
    assert.equal(edges[0].source, nodes[0].id);
    assert.equal(edges[0].target, nodes[1].id);
    assert.equal(edges[0].relationType, 'sequel');
    assert.equal(edges[0].label, 'Sequel');

    assert.equal(edges[1].source, nodes[1].id);
    assert.equal(edges[1].target, nodes[2].id);
  });

  it('should match with existing library items and inherit user watch status and ratings', async () => {
    // Save Batman Begins in user library marked completed with personal rating 9.0
    await dbModule.saveMediaItem({
      title: 'Batman Begins',
      type: 'movie',
      status: 'completed',
      tmdbId: 272,
      rating: 9.0
    });

    const library = await dbModule.getAllMedia();
    const { nodes } = apiModule.collectionToCanvasGraph(mockDarkKnightCollection, library);

    const beginsNode = nodes.find(n => n.data.title === 'Batman Begins');
    assert.ok(beginsNode);
    assert.ok(beginsNode.data.mediaId);
    assert.equal(beginsNode.data.status, 'completed');
    assert.equal(beginsNode.data.rating, 9.0);

    const darkKnightNode = nodes.find(n => n.data.title === 'The Dark Knight');
    assert.ok(darkKnightNode);
    assert.equal(darkKnightNode.data.status, 'plan_to_watch');
  });
});
