import qrcode from 'qrcode-generator';
import type { QrCodeService } from '../../services/qr-code/qr-code.ts';

const AUTOMATIC_TYPE_NUMBER = 0;
const CELL_SIZE = 4;
const QUIET_ZONE_CELLS = 4;

export class QrCodeGeneratorRenderer implements QrCodeService {
  renderSvg(text: string, accessibleName: string): string {
    const code = qrcode(AUTOMATIC_TYPE_NUMBER, 'M');
    code.addData(text);
    code.make();
    const options = { cellSize: CELL_SIZE, margin: QUIET_ZONE_CELLS * CELL_SIZE, scalable: true, title: accessibleName };
    return code.createSvgTag(options);
  }
}
