export type MediaType = 'video' | 'photo';

export interface MediaCard {
  type: MediaType;
  thumbnail: string;
  width?: number;
  height?: number;
  extension: string;
  downloadUrl: string;
}
