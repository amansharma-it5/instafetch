export type MediaType = 'video' | 'photo';
export type Platform = 'instagram' | 'youtube';

export interface MediaCard {
  type: MediaType;
  thumbnail: string;
  width?: number;
  height?: number;
  extension: string;
  downloadUrl: string;
}
