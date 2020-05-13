'use strict';
/*
 Copyright (C) 2012-2015 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GameBoyAdvanceJoyPad {
    constructor(IOCore) {
        this.IOCore = IOCore;
    }

    initialize() {
        this.keyInput = 0x3ff;
        this.keyInterrupt = 0;
    }

    keyPress(keyPressed) {
        keyPressed = keyPressed | 0;
        keyPressed = 1 << (keyPressed | 0);
        this.keyInput = this.keyInput & ~keyPressed;
        this.checkForMatch();
    }

    keyRelease(keyReleased) {
        keyReleased = keyReleased | 0;
        keyReleased = 1 << (keyReleased | 0);
        this.keyInput = this.keyInput | keyReleased;
        this.checkForMatch();
    }

    checkForMatch() {
        if ((this.keyInterrupt & 0x8000) != 0) {
            if ((~this.keyInput & this.keyInterrupt & 0x3ff) == (this.keyInterrupt & 0x3ff)) {
                this.IOCore.deflagStop();
                this.checkForIRQ();
            }
        } else if ((~this.keyInput & this.keyInterrupt & 0x3ff) != 0) {
            this.IOCore.deflagStop();
            this.checkForIRQ();
        }
    }

    checkForIRQ() {
        if ((this.keyInterrupt & 0x4000) != 0) {
            this.IOCore.irq.requestIRQ(0x1000);
        }
    }

    readKeyStatus8_0() {
        return this.keyInput & 0xff;
    }

    readKeyStatus8_1() {
        return (this.keyInput >> 8) | 0;
    }

    readKeyStatus16() {
        return this.keyInput | 0;
    }

    writeKeyControl8_0(data) {
        data = data | 0;
        this.keyInterrupt = this.keyInterrupt & 0xc300;
        data = data & 0xff;
        this.keyInterrupt = this.keyInterrupt | data;
    }

    writeKeyControl8_1(data) {
        data = data | 0;
        this.keyInterrupt = this.keyInterrupt & 0xff;
        data = data & 0xc3;
        this.keyInterrupt = this.keyInterrupt | (data << 8);
    }

    writeKeyControl16(data) {
        data = data | 0;
        this.keyInterrupt = data & 0xc3ff;
    }

    readKeyControl8_0() {
        return this.keyInterrupt & 0xff;
    }

    readKeyControl8_1() {
        return (this.keyInterrupt >> 8) | 0;
    }

    readKeyControl16() {
        return this.keyInterrupt | 0;
    }

    readKeyStatusControl32() {
        return this.keyInput | (this.keyInterrupt << 16);
    }
}
