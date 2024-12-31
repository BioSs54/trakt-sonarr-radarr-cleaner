const axios = require('axios');
const axiosMockAdapter = require('axios-mock-adapter');
const fs = require('fs');
const { getAccessToken, refreshAccessToken, getStoredTokens } = require('../tokenManager');
const { getWatchedItems, isTempTagged, deleteFromService } = require('../script');

// Mock axios
const mock = new axiosMockAdapter(axios);

const TEST_TOKENS = {
  access_token: process.env.TRAKT_API_KEY,
  refresh_token: process.env.TRAKT_ACCESS_TOKEN,
  expires_in: 3600
};

describe('Token Manager', () => {
  beforeEach(() => {
    mock.reset();
  });

  test('should save tokens to file on successful access token request', async () => {
    mock.onPost('https://api.trakt.tv/oauth/token').reply(200, TEST_TOKENS);

    await getAccessToken('authorization_code');

    const data = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
    expect(data).toEqual(TEST_TOKENS);
  });

  test('should save tokens to file on successful refresh token request', async () => {
    mock.onPost('https://api.trakt.tv/oauth/token').reply(200, TEST_TOKENS);

    await refreshAccessToken('test_refresh_token');

    const data = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
    expect(data).toEqual(TEST_TOKENS);
  });

  test('should read tokens from file', () => {
    fs.writeFileSync("tokens.json", JSON.stringify(TEST_TOKENS, null, 2));

    const tokens = getStoredTokens();
    expect(tokens).toEqual(TEST_TOKENS);
  });

  test('should handle errors during token retrieval', async () => {
    mock.onPost('https://api.trakt.tv/oauth/token').reply(400);

    await expect(getAccessToken('authorization_code')).rejects.toThrow();
  });

  test('should handle errors during token refresh', async () => {
    mock.onPost('https://api.trakt.tv/oauth/token').reply(400);

    await expect(refreshAccessToken('test_refresh_token')).rejects.toThrow();
  });
});
