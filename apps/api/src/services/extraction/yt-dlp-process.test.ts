import { describe, expect, it } from 'vitest';
import { buildYtDlpArgs } from './yt-dlp-process';

describe('YouTube yt-dlp argument policy', () => {
  it('adds only the fixed mweb and loopback PO-token arguments', () => {
    expect(buildYtDlpArgs('https://www.youtube.com/watch?v=aqz-KE-bpKQ', {
      youtubePlayerClient: 'mweb',
      youtubePotProviderUrl: 'http://127.0.0.1:4416',
    })).toEqual(expect.arrayContaining([
      '--extractor-args',
      'youtube:player_client=mweb',
      'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416',
    ]));
  });

  it('rejects arbitrary PO-token provider endpoints', () => {
    expect(() => buildYtDlpArgs('https://www.youtube.com/watch?v=aqz-KE-bpKQ', {
      youtubePlayerClient: 'mweb',
      youtubePotProviderUrl: 'https://attacker.example/po',
    })).toThrow('fixed loopback endpoint');
  });
});
