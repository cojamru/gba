'use strict';
/*
 Copyright (C) 2012-2014 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GameBoyAdvanceCartridge {
    constructor(IOCore) {
        this.IOCore = IOCore;
    }

    initialize() {
        this.flash_is128 = false;
        this.flash_isAtmel = false;
        this.ROM = this.getROMArray(this.IOCore.ROM);
        this.ROM16 = getUint16View(this.ROM);
        this.ROM32 = getInt32View(this.ROM);
        this.decodeName();
        this.decodeFlashType();
    }

    getROMArray(old_array) {
        this.ROMLength = Math.min((old_array.length >> 2) << 2, 0x2000000);
        this.EEPROMStart = (this.ROMLength | 0) > 0x1000000 ? Math.max(this.ROMLength | 0, 0x1ffff00) : 0x1000000;
        let newArray = getUint8Array(this.ROMLength | 0);
        for (let index = 0; (index | 0) < (this.ROMLength | 0); index = ((index | 0) + 1) | 0) {
            newArray[index | 0] = old_array[index | 0] | 0;
        }
        return newArray;
    }

    decodeName() {
        this.name = 'GUID_';
        if ((this.ROMLength | 0) >= 0xc0) {
            for (let address = 0xac; (address | 0) < 0xb3; address = ((address | 0) + 1) | 0) {
                if ((this.ROM[address | 0] | 0) > 0) {
                    this.name += String.fromCharCode(this.ROM[address | 0] | 0);
                } else {
                    this.name += '_';
                }
            }
        }
    }

    decodeFlashType() {
        this.flash_is128 = false;
        this.flash_isAtmel = false;

        let flash_types = 0;

        let F = 'F'.charCodeAt(0) & 0xff;
        let L = 'L'.charCodeAt(0) & 0xff;
        let A = 'A'.charCodeAt(0) & 0xff;
        let S = 'S'.charCodeAt(0) & 0xff;
        let H = 'H'.charCodeAt(0) & 0xff;
        let underScore = '_'.charCodeAt(0) & 0xff;
        let five = '5'.charCodeAt(0) & 0xff;
        let one = '1'.charCodeAt(0) & 0xff;
        let two = '2'.charCodeAt(0) & 0xff;
        let M = 'M'.charCodeAt(0) & 0xff;
        let V = 'V'.charCodeAt(0) & 0xff;
        let length = ((this.ROM.length | 0) - 12) | 0;

        for (let index = 0; (index | 0) < (length | 0); index = ((index | 0) + 4) | 0) {
            if ((this.ROM[index | 0] | 0) == (F | 0)) {
                if ((this.ROM[index | 1] | 0) == (L | 0)) {
                    if ((this.ROM[index | 2] | 0) == (A | 0)) {
                        if ((this.ROM[index | 3] | 0) == (S | 0)) {
                            let tempIndex = ((index | 0) + 4) | 0;
                            if ((this.ROM[tempIndex | 0] | 0) == (H | 0)) {
                                if ((this.ROM[tempIndex | 1] | 0) == (underScore | 0)) {
                                    if ((this.ROM[tempIndex | 2] | 0) == (V | 0)) {
                                        flash_types |= 1;
                                    }
                                } else if ((this.ROM[tempIndex | 1] | 0) == (five | 0)) {
                                    if ((this.ROM[tempIndex | 2] | 0) == (one | 0)) {
                                        if ((this.ROM[tempIndex | 3] | 0) == (two | 0)) {
                                            tempIndex = ((tempIndex | 0) + 4) | 0;
                                            if ((this.ROM[tempIndex | 0] | 0) == (underScore | 0)) {
                                                if ((this.ROM[tempIndex | 1] | 0) == (V | 0)) {
                                                    flash_types |= 2;
                                                }
                                            }
                                        }
                                    }
                                } else if ((this.ROM[tempIndex | 1] | 0) == (one | 0)) {
                                    if ((this.ROM[tempIndex | 2] | 0) == (M | 0)) {
                                        if ((this.ROM[tempIndex | 3] | 0) == (underScore | 0)) {
                                            tempIndex = ((tempIndex | 0) + 4) | 0;
                                            if ((this.ROM[tempIndex | 0] | 0) == (V | 0)) {
                                                flash_types |= 4;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        this.flash_is128 = (flash_types | 0) >= 4;
        this.flash_isAtmel = (flash_types | 0) <= 1;
    }

    readROMOnly8(address) {
        address = address | 0;
        let data = 0;
        if ((address | 0) < (this.ROMLength | 0)) {
            data = this.ROM[address & 0x1ffffff] | 0;
        }
        return data | 0;
    }

    readROMOnly16(address) {
        address = address | 0;
        let data = 0;

        if (__LITTLE_ENDIAN__) {
            if ((address | 0) < (this.ROMLength | 0)) {
                data = this.ROM16[(address >> 1) & 0xffffff] | 0;
            }
        } else {
            if ((address | 0) < (this.ROMLength | 0)) {
                data = this.ROM[address] | (this.ROM[address | 1] << 8);
            }
        }

        return data | 0;
    }

    readROMOnly32(address) {
        address = address | 0;
        let data = 0;

        if (__LITTLE_ENDIAN__) {
            if ((address | 0) < (this.ROMLength | 0)) {
                data = this.ROM32[(address >> 2) & 0x7fffff] | 0;
            }
        } else {
            if ((address | 0) < (this.ROMLength | 0)) {
                data = this.ROM[address] | (this.ROM[address | 1] << 8) | (this.ROM[address | 2] << 16) | (this.ROM[address | 3] << 24);
            }
        }

        return data | 0;
    }

    readROM8(address) {
        address = address | 0;
        let data = 0;
        if ((address | 0) > 0xc9) {
            //Definitely ROM:
            data = this.readROMOnly8(address | 0) | 0;
        } else {
            //Possibly GPIO:
            data = this.IOCore.saves.readGPIO8(address | 0) | 0;
        }
        return data | 0;
    }

    readROM16(address) {
        address = address | 0;
        let data = 0;
        if ((address | 0) > 0xc9) {
            //Definitely ROM:
            data = this.readROMOnly16(address | 0) | 0;
        } else {
            //Possibly GPIO:
            data = this.IOCore.saves.readGPIO16(address | 0) | 0;
        }
        return data | 0;
    }

    readROM32(address) {
        address = address | 0;
        let data = 0;
        if ((address | 0) > 0xc9) {
            //Definitely ROM:
            data = this.readROMOnly32(address | 0) | 0;
        } else {
            //Possibly GPIO:
            data = this.IOCore.saves.readGPIO32(address | 0) | 0;
        }
        return data | 0;
    }

    readROM8Space2(address) {
        address = address | 0;
        let data = 0;
        if ((address | 0) >= 0xc4 && (address | 0) < 0xca) {
            //Possibly GPIO:
            data = this.IOCore.saves.readGPIO8(address | 0) | 0;
        } else if ((address | 0) >= (this.EEPROMStart | 0)) {
            //Possibly EEPROM:
            data = this.IOCore.saves.readEEPROM8(address | 0) | 0;
        } else {
            //Definitely ROM:
            data = this.readROMOnly8(address | 0) | 0;
        }
        return data | 0;
    }

    readROM16Space2(address) {
        address = address | 0;
        let data = 0;
        if ((address | 0) >= 0xc4 && (address | 0) < 0xca) {
            //Possibly GPIO:
            data = this.IOCore.saves.readGPIO16(address | 0) | 0;
        } else if ((address | 0) >= (this.EEPROMStart | 0)) {
            //Possibly EEPROM:
            data = this.IOCore.saves.readEEPROM16(address | 0) | 0;
        } else {
            //Definitely ROM:
            data = this.readROMOnly16(address | 0) | 0;
        }
        return data | 0;
    }

    readROM32Space2(address) {
        address = address | 0;
        let data = 0;
        if ((address | 0) >= 0xc4 && (address | 0) < 0xca) {
            //Possibly GPIO:
            data = this.IOCore.saves.readGPIO32(address | 0) | 0;
        } else if ((address | 0) >= (this.EEPROMStart | 0)) {
            //Possibly EEPROM:
            data = this.IOCore.saves.readEEPROM32(address | 0) | 0;
        } else {
            //Definitely ROM:
            data = this.readROMOnly32(address | 0) | 0;
        }
        return data | 0;
    }

    writeROM8(address, data) {
        address = address | 0;
        data = data | 0;
        if ((address | 0) >= 0xc4 && (address | 0) < 0xca) {
            //GPIO Chip (RTC):
            this.IOCore.saves.writeGPIO8(address | 0, data | 0);
        }
    }

    writeROM16(address, data) {
        address = address | 0;
        data = data | 0;
        if ((address | 0) >= 0xc4 && (address | 0) < 0xca) {
            //GPIO Chip (RTC):
            this.IOCore.saves.writeGPIO16(address | 0, data | 0);
        }
    }

    writeROM16DMA(address, data) {
        address = address | 0;
        data = data | 0;
        if ((address | 0) >= 0xc4 && (address | 0) < 0xca) {
            //GPIO Chip (RTC):
            this.IOCore.saves.writeGPIO16(address | 0, data | 0);
        } else if ((address | 0) >= (this.EEPROMStart | 0)) {
            //Possibly EEPROM:
            this.IOCore.saves.writeEEPROM16(address | 0, data | 0);
        }
    }

    writeROM32(address, data) {
        address = address | 0;
        data = data | 0;
        if ((address | 0) >= 0xc4 && (address | 0) < 0xca) {
            //GPIO Chip (RTC):
            this.IOCore.saves.writeGPIO32(address | 0, data | 0);
        }
    }

    nextIRQEventTime() {
        //Nothing yet implement that would fire an IRQ:
        return 0x7fffffff;
    }
}
