export interface QrCodeService {
  renderSvg(text: string, accessibleName: string): string;
}
