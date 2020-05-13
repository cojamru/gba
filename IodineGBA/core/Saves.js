'use strict';
/*
 Copyright (C) 2012-2016 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GameBoyAdvanceSaves {
    constructor(IOCore) {
        this.cartridge = IOCore.cartridge;
    }

    initialize() {
        this.saveType = 0;
        this.GPIOChip = new GameBoyAdvanceGPIOChip();
        this.UNDETERMINED = new GameBoyAdvanceSaveDeterminer(this);
        this.SRAMChip = new GameBoyAdvanceSRAMChip();
        this.FLASHChip = new GameBoyAdvanceFLASHChip(this.cartridge.flash_is128, this.cartridge.flash_isAtmel);
        this.EEPROMChip = new GameBoyAdvanceEEPROMChip(this.cartridge.IOCore);
        this.currentChip = this.UNDETERMINED;
        this.referenceSave(this.saveType);
    }

    referenceSave(saveType) {
        saveType = saveType | 0;
        switch (saveType | 0) {
            case 0:
                this.currentChip = this.UNDETERMINED;
                break;
            case 1:
                this.currentChip = this.SRAMChip;
                break;
            case 2:
                this.currentChip = this.FLASHChip;
                break;
            case 3:
                this.currentChip = this.EEPROMChip;
        }
        this.currentChip.initialize();
        this.saveType = saveType | 0;
    }

    importSave(saves, saveType) {
        saveType = saveType | 0;
        this.UNDETERMINED.load(saves);
        this.SRAMChip.load(saves);
        this.FLASHChip.load(saves);
        this.EEPROMChip.load(saves);
        this.referenceSave(saveType | 0);
    }

    importRTC(saves) {
        this.GPIOChip.loadRTC(saves);
    }

    importGPIOType(gpioType) {
        gpioType = gpioType | 0;
        this.GPIOChip.loadType(gpioType | 0);
    }

    exportSave() {
        return this.currentChip.saves;
    }

    exportSaveType() {
        return this.saveType | 0;
    }

    readGPIO8(address) {
        address = address | 0;
        var data = 0;
        if ((this.GPIOChip.getType() | 0) > 0) {
            //GPIO:
            data = this.GPIOChip.read8(address | 0) | 0;
        } else {
            //ROM:
            data = this.cartridge.readROMOnly8(address | 0) | 0;
        }
        return data | 0;
    }

    readEEPROM8(address) {
        address = address | 0;
        var data = 0;
        if ((this.saveType | 0) == 3) {
            //EEPROM:
            data = this.EEPROMChip.read8() | 0;
        } else {
            //UNKNOWN:
            data = this.UNDETERMINED.readEEPROM8(address | 0) | 0;
        }
        return data | 0;
    }

    readGPIO16(address) {
        address = address | 0;
        var data = 0;
        if ((this.GPIOChip.getType() | 0) > 0) {
            //GPIO:
            data = this.GPIOChip.read16(address | 0) | 0;
        } else {
            //ROM:
            data = this.cartridge.readROMOnly16(address | 0) | 0;
        }
        return data | 0;
    }

    readEEPROM16(address) {
        address = address | 0;
        var data = 0;
        if ((this.saveType | 0) == 3) {
            //EEPROM:
            data = this.EEPROMChip.read16() | 0;
        } else {
            //UNKNOWN:
            data = this.UNDETERMINED.readEEPROM16(address | 0) | 0;
        }
        return data | 0;
    }

    readGPIO32(address) {
        address = address | 0;
        var data = 0;
        if ((this.GPIOChip.getType() | 0) > 0) {
            //GPIO:
            data = this.GPIOChip.read32(address | 0) | 0;
        } else {
            //ROM:
            data = this.cartridge.readROMOnly32(address | 0) | 0;
        }
        return data | 0;
    }

    readEEPROM32(address) {
        address = address | 0;
        var data = 0;
        if ((this.saveType | 0) == 3) {
            //EEPROM:
            data = this.EEPROMChip.read32() | 0;
        } else {
            //UNKNOWN:
            data = this.UNDETERMINED.readEEPROM32(address | 0) | 0;
        }
        return data | 0;
    }

    readSRAM(address) {
        address = address | 0;
        var data = 0;
        switch (this.saveType | 0) {
            case 0:
                //UNKNOWN:
                data = this.UNDETERMINED.readSRAM(address | 0) | 0;
                break;
            case 1:
                //SRAM:
                data = this.SRAMChip.read(address | 0) | 0;
                break;
            case 2:
                //FLASH:
                data = this.FLASHChip.read(address | 0) | 0;
        }
        return data | 0;
    }

    writeGPIO8(address, data) {
        address = address | 0;
        data = data | 0;
        if ((this.GPIOChip.getType() | 0) > 0) {
            //GPIO:
            this.GPIOChip.write8(address | 0, data | 0);
        } else {
            //Unknown:
            this.UNDETERMINED.writeGPIO8(address | 0, data | 0);
        }
    }

    writeGPIO16(address, data) {
        address = address | 0;
        data = data | 0;
        if ((this.GPIOChip.getType() | 0) > 0) {
            //GPIO:
            this.GPIOChip.write16(address | 0, data | 0);
        } else {
            //Unknown:
            this.UNDETERMINED.writeGPIO16(address | 0, data | 0);
        }
    }

    writeEEPROM16(address, data) {
        address = address | 0;
        data = data | 0;
        if ((this.saveType | 0) == 3) {
            //EEPROM:
            this.EEPROMChip.write16(data | 0);
        } else {
            //Unknown:
            this.UNDETERMINED.writeEEPROM16(address | 0, data | 0);
        }
    }

    writeGPIO32(address, data) {
        address = address | 0;
        data = data | 0;
        if ((this.GPIOChip.getType() | 0) > 0) {
            //GPIO:
            this.GPIOChip.write32(address | 0, data | 0);
        } else {
            //Unknown:
            this.UNDETERMINED.writeGPIO32(address | 0, data | 0);
        }
    }

    writeSRAM(address, data) {
        address = address | 0;
        data = data | 0;
        switch (this.saveType | 0) {
            case 0:
                //Unknown:
                this.UNDETERMINED.writeSRAM(address | 0, data | 0);
                break;
            case 1:
                //SRAM:
                this.SRAMChip.write(address | 0, data | 0);
                break;
            case 2:
                //FLASH:
                this.FLASHChip.write(address | 0, data | 0);
        }
    }

    writeSRAMIfDefined(address, data) {
        address = address | 0;
        data = data | 0;
        switch (this.saveType | 0) {
            case 0:
                //UNKNOWN:
                this.SRAMChip.initialize();
            case 1:
                //SRAM:
                this.SRAMChip.write(address | 0, data | 0);
                break;
            case 2:
                //FLASH:
                this.FLASHChip.write(address | 0, data | 0);
        }
    }
}
