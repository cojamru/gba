'use strict';
/*
 Copyright (C) 2012-2015 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GameBoyAdvanceSerial {
    constructor(IOCore) {
        this.IOCore = IOCore;
        this.SIOMultiplayerBaudRate = [9600, 38400, 57600, 115200];
    }
    initialize() {
        this.SIODATA_A = 0xffff;
        this.SIODATA_B = 0xffff;
        this.SIODATA_C = 0xffff;
        this.SIODATA_D = 0xffff;
        this.SIOShiftClockExternal = 0;
        this.SIOShiftClockDivider = 0x40;
        this.SIOCNT0_DATA = 0x0c;
        this.SIOTransferStarted = false;
        this.SIOMULT_PLAYER_NUMBER = 0;
        this.SIOCOMMERROR = false;
        this.SIOBaudRate = 0;
        this.SIOCNT_UART_CTS = false;
        this.SIOCNT_UART_MISC = 0;
        this.SIOCNT_UART_FIFO = 0;
        this.SIOCNT_IRQ = 0;
        this.SIOCNT_MODE = 0;
        this.SIOCNT_UART_RECV_ENABLE = false;
        this.SIOCNT_UART_SEND_ENABLE = false;
        this.SIOCNT_UART_PARITY_ENABLE = false;
        this.SIOCNT_UART_FIFO_ENABLE = false;
        this.SIODATA8 = 0xffff;
        this.RCNTMode = 0;
        this.RCNTIRQ = false;
        this.RCNTDataBits = 0;
        this.RCNTDataBitFlow = 0;
        this.JOYBUS_IRQ = 0;
        this.JOYBUS_CNTL_FLAGS = 0;
        this.JOYBUS_RECV0 = 0xff;
        this.JOYBUS_RECV1 = 0xff;
        this.JOYBUS_RECV2 = 0xff;
        this.JOYBUS_RECV3 = 0xff;
        this.JOYBUS_SEND0 = 0xff;
        this.JOYBUS_SEND1 = 0xff;
        this.JOYBUS_SEND2 = 0xff;
        this.JOYBUS_SEND3 = 0xff;
        this.JOYBUS_STAT = 0;
        this.shiftClocks = 0;
        this.serialBitsShifted = 0;
    }
    addClocks(clocks) {
        clocks = clocks | 0;
        if ((this.RCNTMode | 0) < 2) {
            switch (this.SIOCNT_MODE | 0) {
                case 0:
                case 1:
                    if (this.SIOTransferStarted && (this.SIOShiftClockExternal | 0) == 0) {
                        this.shiftClocks = ((this.shiftClocks | 0) + (clocks | 0)) | 0;
                        while ((this.shiftClocks | 0) >= (this.SIOShiftClockDivider | 0)) {
                            this.shiftClocks = ((this.shiftClocks | 0) - (this.SIOShiftClockDivider | 0)) | 0;
                            this.clockSerial();
                        }
                    }
                    break;
                case 2:
                    if (this.SIOTransferStarted && (this.SIOMULT_PLAYER_NUMBER | 0) == 0) {
                        this.shiftClocks = ((this.shiftClocks | 0) + (clocks | 0)) | 0;
                        while ((this.shiftClocks | 0) >= (this.SIOShiftClockDivider | 0)) {
                            this.shiftClocks = ((this.shiftClocks | 0) - (this.SIOShiftClockDivider | 0)) | 0;
                            this.clockMultiplayer();
                        }
                    }
                    break;
                case 3:
                    if (this.SIOCNT_UART_SEND_ENABLE && !this.SIOCNT_UART_CTS) {
                        this.shiftClocks = ((this.shiftClocks | 0) + (clocks | 0)) | 0;
                        while ((this.shiftClocks | 0) >= (this.SIOShiftClockDivider | 0)) {
                            this.shiftClocks = ((this.shiftClocks | 0) - (this.SIOShiftClockDivider | 0)) | 0;
                            this.clockUART();
                        }
                    }
            }
        }
    }
    clockSerial() {
        //Emulate as if no slaves connected:
        this.serialBitsShifted = ((this.serialBitsShifted | 0) + 1) | 0;
        if ((this.SIOCNT_MODE | 0) == 0) {
            //8-bit
            this.SIODATA8 = ((this.SIODATA8 << 1) | 1) & 0xffff;
            if ((this.serialBitsShifted | 0) == 8) {
                this.SIOTransferStarted = false;
                this.serialBitsShifted = 0;
                if ((this.SIOCNT_IRQ | 0) != 0) {
                    //this.IOCore.irq.requestIRQ(0x80);
                }
            }
        } else {
            //32-bit
            this.SIODATA_D = ((this.SIODATA_D << 1) & 0xfe) | (this.SIODATA_C >> 7);
            this.SIODATA_C = ((this.SIODATA_C << 1) & 0xfe) | (this.SIODATA_B >> 7);
            this.SIODATA_B = ((this.SIODATA_B << 1) & 0xfe) | (this.SIODATA_A >> 7);
            this.SIODATA_A = ((this.SIODATA_A << 1) & 0xfe) | 1;
            if ((this.serialBitsShifted | 0) == 32) {
                this.SIOTransferStarted = false;
                this.serialBitsShifted = 0;
                if ((this.SIOCNT_IRQ | 0) != 0) {
                    //this.IOCore.irq.requestIRQ(0x80);
                }
            }
        }
    }
    clockMultiplayer() {
        //Emulate as if no slaves connected:
        this.SIODATA_A = this.SIODATA8 | 0;
        this.SIODATA_B = 0xffff;
        this.SIODATA_C = 0xffff;
        this.SIODATA_D = 0xffff;
        this.SIOTransferStarted = false;
        this.SIOCOMMERROR = true;
        if ((this.SIOCNT_IRQ | 0) != 0) {
            //this.IOCore.irq.requestIRQ(0x80);
        }
    }
    clockUART() {
        this.serialBitsShifted = ((this.serialBitsShifted | 0) + 1) | 0;
        if (this.SIOCNT_UART_FIFO_ENABLE) {
            if ((this.serialBitsShifted | 0) == 8) {
                this.serialBitsShifted = 0;
                this.SIOCNT_UART_FIFO = Math.max(((this.SIOCNT_UART_FIFO | 0) - 1) | 0, 0) | 0;
                if ((this.SIOCNT_UART_FIFO | 0) == 0 && (this.SIOCNT_IRQ | 0) != 0) {
                    //this.IOCore.irq.requestIRQ(0x80);
                }
            }
        } else {
            if ((this.serialBitsShifted | 0) == 8) {
                this.serialBitsShifted = 0;
                if ((this.SIOCNT_IRQ | 0) != 0) {
                    //this.IOCore.irq.requestIRQ(0x80);
                }
            }
        }
    }
    writeSIODATA_A0(data) {
        data = data | 0;
        this.SIODATA_A = (this.SIODATA_A & 0xff00) | data;
    }
    readSIODATA_A0() {
        return this.SIODATA_A & 0xff;
    }
    writeSIODATA_A1(data) {
        data = data | 0;
        this.SIODATA_A = (this.SIODATA_A & 0xff) | (data << 8);
    }
    readSIODATA_A1() {
        return this.SIODATA_A >> 8;
    }
    writeSIODATA_B0(data) {
        data = data | 0;
        this.SIODATA_B = (this.SIODATA_B & 0xff00) | data;
    }
    readSIODATA_B0() {
        return this.SIODATA_B & 0xff;
    }
    writeSIODATA_B1(data) {
        data = data | 0;
        this.SIODATA_B = (this.SIODATA_B & 0xff) | (data << 8);
    }
    readSIODATA_B1() {
        return this.SIODATA_B >> 8;
    }
    writeSIODATA_C0(data) {
        data = data | 0;
        this.SIODATA_C = (this.SIODATA_C & 0xff00) | data;
    }
    readSIODATA_C0() {
        return this.SIODATA_C & 0xff;
    }
    writeSIODATA_C1(data) {
        data = data | 0;
        this.SIODATA_C = (this.SIODATA_C & 0xff) | (data << 8);
    }
    readSIODATA_C1() {
        return this.SIODATA_C >> 8;
    }
    writeSIODATA_D0(data) {
        data = data | 0;
        this.SIODATA_D = (this.SIODATA_D & 0xff00) | data;
    }
    readSIODATA_D0() {
        return this.SIODATA_D & 0xff;
    }
    writeSIODATA_D1(data) {
        data = data | 0;
        this.SIODATA_D = (this.SIODATA_D & 0xff) | (data << 8);
    }
    readSIODATA_D1() {
        return this.SIODATA_D >> 8;
    }
    writeSIOCNT0(data) {
        if ((this.RCNTMode | 0) < 0x2) {
            switch (this.SIOCNT_MODE | 0) {
                //8-Bit:
                case 0:
                //32-Bit:
                case 1:
                    this.SIOShiftClockExternal = data & 0x1;
                    this.SIOShiftClockDivider = (data & 0x2) != 0 ? 0x8 : 0x40;
                    this.SIOCNT0_DATA = data & 0xb;
                    if ((data & 0x80) != 0) {
                        if (!this.SIOTransferStarted) {
                            this.SIOTransferStarted = true;
                            this.serialBitsShifted = 0;
                            this.shiftClocks = 0;
                        }
                    } else {
                        this.SIOTransferStarted = false;
                    }
                    break;
                //Multiplayer:
                case 2:
                    this.SIOBaudRate = data & 0x3;
                    this.SIOShiftClockDivider = this.SIOMultiplayerBaudRate[this.SIOBaudRate | 0] | 0;
                    this.SIOMULT_PLAYER_NUMBER = (data >> 4) & 0x3;
                    this.SIOCOMMERROR = (data & 0x40) != 0;
                    if ((data & 0x80) != 0) {
                        if (!this.SIOTransferStarted) {
                            this.SIOTransferStarted = true;
                            if ((this.SIOMULT_PLAYER_NUMBER | 0) == 0) {
                                this.SIODATA_A = 0xffff;
                                this.SIODATA_B = 0xffff;
                                this.SIODATA_C = 0xffff;
                                this.SIODATA_D = 0xffff;
                            }
                            this.serialBitsShifted = 0;
                            this.shiftClocks = 0;
                        }
                    } else {
                        this.SIOTransferStarted = false;
                    }
                    break;
                //UART:
                case 3:
                    this.SIOBaudRate = data & 0x3;
                    this.SIOShiftClockDivider = this.SIOMultiplayerBaudRate[this.SIOBaudRate | 0] | 0;
                    this.SIOCNT_UART_MISC = (data & 0xcf) >> 2;
                    this.SIOCNT_UART_CTS = (data & 0x4) != 0;
            }
        }
    }
    readSIOCNT0() {
        if (this.RCNTMode < 0x2) {
            switch (this.SIOCNT_MODE) {
                //8-Bit:
                case 0:
                //32-Bit:
                case 1:
                    return (this.SIOTransferStarted ? 0x80 : 0) | 0x74 | this.SIOCNT0_DATA;
                //Multiplayer:
                case 2:
                    return (
                        (this.SIOTransferStarted ? 0x80 : 0) | (this.SIOCOMMERROR ? 0x40 : 0) | (this.SIOMULT_PLAYER_NUMBER << 4) | this.SIOBaudRate
                    );
                //UART:
                case 3:
                    return (this.SIOCNT_UART_MISC << 2) | (this.SIOCNT_UART_FIFO == 4 ? 0x30 : 0x20) | this.SIOBaudRate;
            }
        }
        return 0xff;
    }
    writeSIOCNT1(data) {
        this.SIOCNT_IRQ = data & 0x40;
        this.SIOCNT_MODE = (data >> 4) & 0x3;
        this.SIOCNT_UART_RECV_ENABLE = (data & 0x8) != 0;
        this.SIOCNT_UART_SEND_ENABLE = (data & 0x4) != 0;
        this.SIOCNT_UART_PARITY_ENABLE = (data & 0x2) != 0;
        this.SIOCNT_UART_FIFO_ENABLE = (data & 0x1) != 0;
    }
    readSIOCNT1() {
        return (
            0x80 |
            this.SIOCNT_IRQ |
            (this.SIOCNT_MODE << 4) |
            (this.SIOCNT_UART_RECV_ENABLE ? 0x8 : 0) |
            (this.SIOCNT_UART_SEND_ENABLE ? 0x4 : 0) |
            (this.SIOCNT_UART_PARITY_ENABLE ? 0x2 : 0) |
            (this.SIOCNT_UART_FIFO_ENABLE ? 0x2 : 0)
        );
    }
    writeSIODATA8_0(data) {
        data = data | 0;
        this.SIODATA8 = (this.SIODATA8 & 0xff00) | data;
        if ((this.RCNTMode | 0) < 0x2 && (this.SIOCNT_MODE | 0) == 3 && this.SIOCNT_UART_FIFO_ENABLE) {
            this.SIOCNT_UART_FIFO = Math.min(((this.SIOCNT_UART_FIFO | 0) + 1) | 0, 4) | 0;
        }
    }
    readSIODATA8_0() {
        return this.SIODATA8 & 0xff;
    }
    writeSIODATA8_1(data) {
        data = data | 0;
        this.SIODATA8 = (this.SIODATA8 & 0xff) | (data << 8);
    }
    readSIODATA8_1() {
        return this.SIODATA8 >> 8;
    }
    writeRCNT0(data) {
        if ((this.RCNTMode | 0) == 0x2) {
            //General Comm:
            var oldDataBits = this.RCNTDataBits | 0;
            this.RCNTDataBits = data & 0xf; //Device manually controls SI/SO/SC/SD here.
            this.RCNTDataBitFlow = data >> 4;
            if (this.RCNTIRQ && ((oldDataBits ^ this.RCNTDataBits) & oldDataBits & 0x4) != 0) {
                //SI fell low, trigger IRQ:
                //this.IOCore.irq.requestIRQ(0x80);
            }
        }
    }
    readRCNT0() {
        return (this.RCNTDataBitFlow << 4) | this.RCNTDataBits;
    }
    writeRCNT1(data) {
        this.RCNTMode = data >> 6;
        this.RCNTIRQ = (data & 0x1) != 0;
        if ((this.RCNTMode | 0) != 0x2) {
            //Force SI/SO/SC/SD to low as we're never "hooked" up:
            this.RCNTDataBits = 0;
            this.RCNTDataBitFlow = 0;
        }
    }
    readRCNT1() {
        return (this.RCNTMode << 6) | (this.RCNTIRQ ? 0x3f : 0x3e);
    }
    writeJOYCNT(data) {
        this.JOYBUS_IRQ = (data << 25) >> 31;
        this.JOYBUS_CNTL_FLAGS &= ~(data & 0x7);
    }
    readJOYCNT() {
        return this.JOYBUS_CNTL_FLAGS | 0x40 | (0xb8 & this.JOYBUS_IRQ);
    }
    writeJOYBUS_RECV0(data) {
        this.JOYBUS_RECV0 = data | 0;
    }
    readJOYBUS_RECV0() {
        this.JOYBUS_STAT = this.JOYBUS_STAT & 0xf7;
        return this.JOYBUS_RECV0 | 0;
    }
    writeJOYBUS_RECV1(data) {
        this.JOYBUS_RECV1 = data | 0;
    }
    readJOYBUS_RECV1() {
        this.JOYBUS_STAT = this.JOYBUS_STAT & 0xf7;
        return this.JOYBUS_RECV1 | 0;
    }
    writeJOYBUS_RECV2(data) {
        this.JOYBUS_RECV2 = data | 0;
    }
    readJOYBUS_RECV2() {
        this.JOYBUS_STAT = this.JOYBUS_STAT & 0xf7;
        return this.JOYBUS_RECV2 | 0;
    }
    writeJOYBUS_RECV3(data) {
        this.JOYBUS_RECV3 = data | 0;
    }
    readJOYBUS_RECV3() {
        this.JOYBUS_STAT = this.JOYBUS_STAT & 0xf7;
        return this.JOYBUS_RECV3 | 0;
    }
    writeJOYBUS_SEND0(data) {
        this.JOYBUS_SEND0 = data | 0;
        this.JOYBUS_STAT = this.JOYBUS_STAT | 0x2;
    }
    readJOYBUS_SEND0() {
        return this.JOYBUS_SEND0 | 0;
    }
    writeJOYBUS_SEND1(data) {
        this.JOYBUS_SEND1 = data | 0;
        this.JOYBUS_STAT = this.JOYBUS_STAT | 0x2;
    }
    readJOYBUS_SEND1() {
        return this.JOYBUS_SEND1 | 0;
    }
    writeJOYBUS_SEND2(data) {
        this.JOYBUS_SEND2 = data | 0;
        this.JOYBUS_STAT = this.JOYBUS_STAT | 0x2;
    }
    readJOYBUS_SEND2() {
        return this.JOYBUS_SEND2 | 0;
    }
    writeJOYBUS_SEND3(data) {
        this.JOYBUS_SEND3 = data | 0;
        this.JOYBUS_STAT = this.JOYBUS_STAT | 0x2;
    }
    readJOYBUS_SEND3() {
        return this.JOYBUS_SEND3 | 0;
    }
    writeJOYBUS_STAT(data) {
        this.JOYBUS_STAT = data | 0;
    }
    readJOYBUS_STAT() {
        return 0xc5 | this.JOYBUS_STAT;
    }
    // nextIRQEventTime(clocks) {
    //     if ((this.SIOCNT_IRQ | 0) != 0 && (this.RCNTMode | 0) < 2) {
    //         switch (this.SIOCNT_MODE | 0) {
    //             case 0:
    //             case 1:
    //                 if (this.SIOTransferStarted && (this.SIOShiftClockExternal | 0) == 0) {
    //                     return (
    //                         ((this.SIOCNT_MODE == 1 ? 31 : 7) - this.serialBitsShifted) * this.SIOShiftClockDivider +
    //                         (this.SIOShiftClockDivider - this.shiftClocks)
    //                     );
    //                 } else {
    //                     return 0x7fffffff;
    //                 }
    //             case 2:
    //                 if (this.SIOTransferStarted && this.SIOMULT_PLAYER_NUMBER == 0) {
    //                     return this.SIOShiftClockDivider - this.shiftClocks;
    //                 } else {
    //                     return 0x7fffffff;
    //                 }
    //             case 3:
    //                 if (this.SIOCNT_UART_SEND_ENABLE && !this.SIOCNT_UART_CTS) {
    //                     return (
    //                         Math.max((this.SIOCNT_UART_FIFO_ENABLE ? this.SIOCNT_UART_FIFO * 8 : 8) - 1, 0) * this.SIOShiftClockDivider +
    //                         (this.SIOShiftClockDivider - this.shiftClocks)
    //                     );
    //                 } else {
    //                     return 0x7fffffff;
    //                 }
    //         }
    //     } else {
    //         return 0x7fffffff;
    //     }
    // }
}
