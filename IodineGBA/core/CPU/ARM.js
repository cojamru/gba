'use strict';
/*
 Copyright (C) 2012-2015 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class ARMInstructionSet {
    constructor(CPUCore) {
        this.CPUCore = CPUCore;
        this.initialize();
    }
    initialize() {
        this.wait = this.CPUCore.wait;
        this.registers = this.CPUCore.registers;
        this.registersUSR = this.CPUCore.registersUSR;
        this.branchFlags = this.CPUCore.branchFlags;
        this.fetch = 0;
        this.decode = 0;
        this.execute = 0;
        this.memory = this.CPUCore.memory;
    }
    executeIteration() {
        //Push the new fetch access:
        this.fetch = this.memory.memoryReadCPU32(this.readPC() | 0) | 0;
        //Execute Conditional Instruction:
        this.executeConditionalCode();
        //Update the pipelining state:
        this.execute = this.decode | 0;
        this.decode = this.fetch | 0;
    }
    executeConditionalCode() {
        //LSB of condition code is used to reverse the test logic:
        if (((this.execute << 3) ^ this.branchFlags.checkConditionalCode(this.execute | 0)) >= 0) {
            //Passed the condition code test, so execute:
            this.executeDecoded();
        } else {
            //Increment the program counter if we failed the test:
            this.incrementProgramCounter();
        }
    }
    executeBubble() {
        //Push the new fetch access:
        this.fetch = this.memory.memoryReadCPU32(this.readPC() | 0) | 0;
        //Update the Program Counter:
        this.incrementProgramCounter();
        //Update the pipelining state:
        this.execute = this.decode | 0;
        this.decode = this.fetch | 0;
    }
    incrementProgramCounter() {
        //Increment The Program Counter:
        this.registers[15] = ((this.registers[15] | 0) + 4) | 0;
    }
    getLR() {
        return ((this.readPC() | 0) - 4) | 0;
    }
    getIRQLR() {
        return this.getLR() | 0;
    }
    getCurrentFetchValue() {
        return this.fetch | 0;
    }
    getSWICode() {
        return (this.execute >> 16) & 0xff;
    }
    getPopCount() {
        var temp = this.execute & 0xffff;

        temp = ((temp | 0) - ((temp >> 1) & 0x5555)) | 0;
        temp = ((temp & 0x3333) + ((temp >> 2) & 0x3333)) | 0;
        temp = (((temp | 0) + (temp >> 4)) & 0xf0f) | 0;

        //Math.imul found, insert the optimized path in:
        if (typeof Math.imul == 'function') {
            temp = Math.imul(temp | 0, 0x1010101) >> 24;
        } else {
            //Math.imul not found, use the compatibility method:
            temp = (temp * 0x1010101) >> 24;
        }

        return temp | 0;
    }
    getNegativeOffsetStartAddress(currentAddress) {
        //Used for LDMD/STMD:
        currentAddress = currentAddress | 0;
        var offset = this.getPopCount() << 2;
        currentAddress = ((currentAddress | 0) - (offset | 0)) | 0;
        return currentAddress | 0;
    }
    getPositiveOffsetStartAddress(currentAddress) {
        //Used for LDMD/STMD:
        currentAddress = currentAddress | 0;
        var offset = this.getPopCount() << 2;
        currentAddress = ((currentAddress | 0) + (offset | 0)) | 0;
        return currentAddress | 0;
    }
    writeRegister(address, data) {
        //Unguarded non-pc register write:
        address = address | 0;
        data = data | 0;
        this.registers[address & 0xf] = data | 0;
    }
    writeUserRegister(address, data) {
        //Unguarded non-pc user mode register write:
        address = address | 0;
        data = data | 0;
        this.registersUSR[address & 0x7] = data | 0;
    }
    guardRegisterWrite(address, data) {
        //Guarded register write:
        address = address | 0;
        data = data | 0;
        if ((address | 0) < 0xf) {
            //Non-PC Write:
            this.writeRegister(address | 0, data | 0);
        } else {
            //We performed a branch:
            this.CPUCore.branch(data & -4);
        }
    }
    multiplyGuard12OffsetRegisterWrite(data) {
        //Writes to R15 ignored in the multiply instruction!
        data = data | 0;
        var address = (this.execute >> 0xc) & 0xf;
        if ((address | 0) != 0xf) {
            this.writeRegister(address | 0, data | 0);
        }
    }
    multiplyGuard16OffsetRegisterWrite(data) {
        //Writes to R15 ignored in the multiply instruction!
        data = data | 0;
        var address = (this.execute >> 0x10) & 0xf;
        this.incrementProgramCounter();
        if ((address | 0) != 0xf) {
            this.writeRegister(address | 0, data | 0);
        }
    }
    performMUL32() {
        var result = 0;
        if (((this.execute >> 16) & 0xf) != (this.execute & 0xf)) {
            /*
             http://www.chiark.greenend.org.uk/~theom/riscos/docs/ultimate/a252armc.txt

             Due to the way that Booth's algorithm has been implemented, certain
             combinations of operand registers should be avoided. (The assembler will
             issue a warning if these restrictions are overlooked.)
             The destination register (Rd) should not be the same as the Rm operand
             register, as Rd is used to hold intermediate values and Rm is used
             repeatedly during the multiply. A MUL will give a zero result if Rm=Rd, and
             a MLA will give a meaningless result.
             */
            result = this.CPUCore.performMUL32(this.read0OffsetRegister() | 0, this.read8OffsetRegister() | 0) | 0;
        }
        return result | 0;
    }
    performMUL32MLA() {
        var result = 0;
        if (((this.execute >> 16) & 0xf) != (this.execute & 0xf)) {
            /*
             http://www.chiark.greenend.org.uk/~theom/riscos/docs/ultimate/a252armc.txt

             Due to the way that Booth's algorithm has been implemented, certain
             combinations of operand registers should be avoided. (The assembler will
             issue a warning if these restrictions are overlooked.)
             The destination register (Rd) should not be the same as the Rm operand
             register, as Rd is used to hold intermediate values and Rm is used
             repeatedly during the multiply. A MUL will give a zero result if Rm=Rd, and
             a MLA will give a meaningless result.
             */
            result = this.CPUCore.performMUL32MLA(this.read0OffsetRegister() | 0, this.read8OffsetRegister() | 0) | 0;
        }
        return result | 0;
    }
    guard12OffsetRegisterWrite(data) {
        data = data | 0;
        this.incrementProgramCounter();
        this.guard12OffsetRegisterWrite2(data | 0);
    }
    guard12OffsetRegisterWrite2(data) {
        data = data | 0;
        this.guardRegisterWrite((this.execute >> 0xc) & 0xf, data | 0);
    }
    guard16OffsetRegisterWrite(data) {
        data = data | 0;
        this.guardRegisterWrite((this.execute >> 0x10) & 0xf, data | 0);
    }
    guard16OffsetUserRegisterWrite(data) {
        data = data | 0;
        var address = (this.execute >> 0x10) & 0xf;
        if ((address | 0) < 0xf) {
            //Non-PC Write:
            this.guardUserRegisterWrite(address | 0, data | 0);
        } else {
            //We performed a branch:
            this.CPUCore.branch(data & -4);
        }
    }
    guardProgramCounterRegisterWriteCPSR(data) {
        data = data | 0;
        //Restore SPSR to CPSR:
        data = data & (-4 >> (this.CPUCore.SPSRtoCPSR() >> 5));
        //We performed a branch:
        this.CPUCore.branch(data | 0);
    }
    guardRegisterWriteCPSR(address, data) {
        //Guard for possible pc write with cpsr update:
        address = address | 0;
        data = data | 0;
        if ((address | 0) < 0xf) {
            //Non-PC Write:
            this.writeRegister(address | 0, data | 0);
        } else {
            //Restore SPSR to CPSR:
            this.guardProgramCounterRegisterWriteCPSR(data | 0);
        }
    }
    guard12OffsetRegisterWriteCPSR(data) {
        data = data | 0;
        this.incrementProgramCounter();
        this.guard12OffsetRegisterWriteCPSR2(data | 0);
    }
    guard12OffsetRegisterWriteCPSR2(data) {
        data = data | 0;
        this.guardRegisterWriteCPSR((this.execute >> 0xc) & 0xf, data | 0);
    }
    guard16OffsetRegisterWriteCPSR(data) {
        data = data | 0;
        this.guardRegisterWriteCPSR((this.execute >> 0x10) & 0xf, data | 0);
    }
    guardUserRegisterWrite(address, data) {
        //Guard only on user access, not PC!:
        address = address | 0;
        data = data | 0;
        switch (this.CPUCore.modeFlags & 0x1f) {
            case 0x10:
            case 0x1f:
                this.writeRegister(address | 0, data | 0);
                break;
            case 0x11:
                if ((address | 0) < 8) {
                    this.writeRegister(address | 0, data | 0);
                } else {
                    //User-Mode Register Write Inside Non-User-Mode:
                    this.writeUserRegister(address | 0, data | 0);
                }
                break;
            default:
                if ((address | 0) < 13) {
                    this.writeRegister(address | 0, data | 0);
                } else {
                    //User-Mode Register Write Inside Non-User-Mode:
                    this.writeUserRegister(address | 0, data | 0);
                }
        }
    }
    guardRegisterWriteLDM(address, data) {
        //Proxy guarded register write for LDM:
        address = address | 0;
        data = data | 0;
        this.guardRegisterWrite(address | 0, data | 0);
    }
    guardUserRegisterWriteLDM(address, data) {
        //Proxy guarded user mode register write with PC guard for LDM:
        address = address | 0;
        data = data | 0;
        if ((address | 0) < 0xf) {
            if ((this.execute & 0x8000) != 0) {
                //PC is in the list, don't do user-mode:
                this.writeRegister(address | 0, data | 0);
            } else {
                //PC isn't in the list, do user-mode:
                this.guardUserRegisterWrite(address | 0, data | 0);
            }
        } else {
            this.guardProgramCounterRegisterWriteCPSR(data | 0);
        }
    }
    readPC() {
        //PC register read:
        return this.registers[0xf] | 0;
    }
    readRegister(address) {
        //Unguarded register read:
        address = address | 0;
        return this.registers[address & 0xf] | 0;
    }
    readUserRegister(address) {
        //Unguarded user mode register read:
        address = address | 0;
        var data = 0;
        if ((address | 0) < 0xf) {
            data = this.registersUSR[address & 0x7] | 0;
        } else {
            //Get Special Case PC Read:
            data = this.readPC() | 0;
        }
        return data | 0;
    }
    read0OffsetRegister() {
        //Unguarded register read at position 0:
        return this.readRegister(this.execute | 0) | 0;
    }
    read8OffsetRegister() {
        //Unguarded register read at position 0x8:
        return this.readRegister(this.execute >> 0x8) | 0;
    }
    read12OffsetRegister() {
        //Unguarded register read at position 0xC:
        return this.readRegister(this.execute >> 0xc) | 0;
    }
    read16OffsetRegister() {
        //Unguarded register read at position 0x10:
        return this.readRegister(this.execute >> 0x10) | 0;
    }
    read16OffsetUserRegister() {
        //Guarded register read at position 0x10:
        return this.guardUserRegisterRead(this.execute >> 0x10) | 0;
    }
    guard12OffsetRegisterRead() {
        this.incrementProgramCounter();
        return this.readRegister((this.execute >> 12) & 0xf) | 0;
    }
    guardUserRegisterRead(address) {
        //Guard only on user access, not PC!:
        address = address | 0;
        var data = 0;
        switch (this.CPUCore.modeFlags & 0x1f) {
            case 0x10:
            case 0x1f:
                data = this.readRegister(address | 0) | 0;
                break;
            case 0x11:
                if ((address | 0) < 8) {
                    data = this.readRegister(address | 0) | 0;
                } else {
                    //User-Mode Register Read Inside Non-User-Mode:
                    data = this.readUserRegister(address | 0) | 0;
                }
                break;
            default:
                if ((address | 0) < 13) {
                    data = this.readRegister(address | 0) | 0;
                } else {
                    //User-Mode Register Read Inside Non-User-Mode:
                    data = this.readUserRegister(address | 0) | 0;
                }
        }
        return data | 0;
    }
    BX() {
        //Branch & eXchange:
        var address = this.read0OffsetRegister() | 0;
        if ((address & 0x1) == 0) {
            //Stay in ARM mode:
            this.CPUCore.branch(address & -4);
        } else {
            //Enter THUMB mode:
            this.CPUCore.enterTHUMB();
            this.CPUCore.branch(address & -2);
        }
    }
    B() {
        //Branch:
        this.CPUCore.branch(((this.readPC() | 0) + ((this.execute << 8) >> 6)) | 0);
    }
    BL() {
        //Branch with Link:
        this.writeRegister(0xe, this.getLR() | 0);
        this.B();
    }
    AND() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform bitwise AND:
        //Update destination register:
        this.guard12OffsetRegisterWrite(operand1 & operand2);
    }
    AND2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform bitwise AND:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(operand1 & operand2);
    }
    ANDS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing2() | 0;
        //Perform bitwise AND:
        var result = operand1 & operand2;
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR(result | 0);
    }
    ANDS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing4() | 0;
        //Perform bitwise AND:
        var result = operand1 & operand2;
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR2(result | 0);
    }
    EOR() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform bitwise EOR:
        //Update destination register:
        this.guard12OffsetRegisterWrite(operand1 ^ operand2);
    }
    EOR2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform bitwise EOR:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(operand1 ^ operand2);
    }
    EORS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing2() | 0;
        //Perform bitwise EOR:
        var result = operand1 ^ operand2;
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR(result | 0);
    }
    EORS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing4() | 0;
        //Perform bitwise EOR:
        var result = operand1 ^ operand2;
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR2(result | 0);
    }
    SUB() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform Subtraction:
        //Update destination register:
        this.guard12OffsetRegisterWrite(((operand1 | 0) - (operand2 | 0)) | 0);
    }
    SUB2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform Subtraction:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(((operand1 | 0) - (operand2 | 0)) | 0);
    }
    SUBS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR(this.branchFlags.setSUBFlags(operand1 | 0, operand2 | 0) | 0);
    }
    SUBS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR2(this.branchFlags.setSUBFlags(operand1 | 0, operand2 | 0) | 0);
    }
    RSB() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform Subtraction:
        //Update destination register:
        this.guard12OffsetRegisterWrite(((operand2 | 0) - (operand1 | 0)) | 0);
    }
    RSB2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform Subtraction:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(((operand2 | 0) - (operand1 | 0)) | 0);
    }
    RSBS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR(this.branchFlags.setSUBFlags(operand2 | 0, operand1 | 0) | 0);
    }
    RSBS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR2(this.branchFlags.setSUBFlags(operand2 | 0, operand1 | 0) | 0);
    }
    ADD() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform Addition:
        //Update destination register:
        this.guard12OffsetRegisterWrite(((operand1 | 0) + (operand2 | 0)) | 0);
    }
    ADD2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform Addition:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(((operand1 | 0) + (operand2 | 0)) | 0);
    }
    ADDS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR(this.branchFlags.setADDFlags(operand1 | 0, operand2 | 0) | 0);
    }
    ADDS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR2(this.branchFlags.setADDFlags(operand1 | 0, operand2 | 0) | 0);
    }
    ADC() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform Addition w/ Carry:
        //Update destination register:
        operand1 = ((operand1 | 0) + (operand2 | 0)) | 0;
        operand1 = ((operand1 | 0) + (this.branchFlags.getCarry() >>> 31)) | 0;
        this.guard12OffsetRegisterWrite(operand1 | 0);
    }
    ADC2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform Addition w/ Carry:
        //Update destination register:
        operand1 = ((operand1 | 0) + (operand2 | 0)) | 0;
        operand1 = ((operand1 | 0) + (this.branchFlags.getCarry() >>> 31)) | 0;
        this.guard12OffsetRegisterWrite2(operand1 | 0);
    }
    ADCS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR(this.branchFlags.setADCFlags(operand1 | 0, operand2 | 0) | 0);
    }
    ADCS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR2(this.branchFlags.setADCFlags(operand1 | 0, operand2 | 0) | 0);
    }
    SBC() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform Subtraction w/ Carry:
        //Update destination register:
        operand1 = ((operand1 | 0) - (operand2 | 0)) | 0;
        operand1 = ((operand1 | 0) - (this.branchFlags.getCarryReverse() >>> 31)) | 0;
        this.guard12OffsetRegisterWrite(operand1 | 0);
    }
    SBC2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform Subtraction w/ Carry:
        //Update destination register:
        operand1 = ((operand1 | 0) - (operand2 | 0)) | 0;
        operand1 = ((operand1 | 0) - (this.branchFlags.getCarryReverse() >>> 31)) | 0;
        this.guard12OffsetRegisterWrite2(operand1 | 0);
    }
    SBCS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR(this.branchFlags.setSBCFlags(operand1 | 0, operand2 | 0) | 0);
    }
    SBCS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR2(this.branchFlags.setSBCFlags(operand1 | 0, operand2 | 0) | 0);
    }
    RSC() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform Reverse Subtraction w/ Carry:
        //Update destination register:
        operand1 = ((operand2 | 0) - (operand1 | 0)) | 0;
        operand1 = ((operand1 | 0) - (this.branchFlags.getCarryReverse() >>> 31)) | 0;
        this.guard12OffsetRegisterWrite(operand1 | 0);
    }
    RSC2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform Reverse Subtraction w/ Carry:
        //Update destination register:
        operand1 = ((operand2 | 0) - (operand1 | 0)) | 0;
        operand1 = ((operand1 | 0) - (this.branchFlags.getCarryReverse() >>> 31)) | 0;
        this.guard12OffsetRegisterWrite2(operand1 | 0);
    }
    RSCS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR(this.branchFlags.setSBCFlags(operand2 | 0, operand1 | 0) | 0);
    }
    RSCS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Update destination register:
        this.guard12OffsetRegisterWriteCPSR2(this.branchFlags.setSBCFlags(operand2 | 0, operand1 | 0) | 0);
    }
    TSTS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing2() | 0;
        //Perform bitwise AND:
        var result = operand1 & operand2;
        this.branchFlags.setNZInt(result | 0);
        //Increment PC:
        this.incrementProgramCounter();
    }
    TSTS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing4() | 0;
        //Perform bitwise AND:
        var result = operand1 & operand2;
        this.branchFlags.setNZInt(result | 0);
    }
    TEQS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing2() | 0;
        //Perform bitwise EOR:
        var result = operand1 ^ operand2;
        this.branchFlags.setNZInt(result | 0);
        //Increment PC:
        this.incrementProgramCounter();
    }
    TEQS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing4() | 0;
        //Perform bitwise EOR:
        var result = operand1 ^ operand2;
        this.branchFlags.setNZInt(result | 0);
    }
    CMPS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        this.branchFlags.setCMPFlags(operand1 | 0, operand2 | 0);
        //Increment PC:
        this.incrementProgramCounter();
    }
    CMPS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        this.branchFlags.setCMPFlags(operand1 | 0, operand2 | 0);
    }
    CMNS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1();
        this.branchFlags.setCMNFlags(operand1 | 0, operand2 | 0);
        //Increment PC:
        this.incrementProgramCounter();
    }
    CMNS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3();
        this.branchFlags.setCMNFlags(operand1 | 0, operand2 | 0);
    }
    ORR() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing1() | 0;
        //Perform bitwise OR:
        //Update destination register:
        this.guard12OffsetRegisterWrite(operand1 | operand2);
    }
    ORR2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing3() | 0;
        //Perform bitwise OR:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(operand1 | operand2);
    }
    ORRS() {
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing2() | 0;
        //Perform bitwise OR:
        var result = operand1 | operand2;
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR(result | 0);
    }
    ORRS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        var operand2 = this.operand2OP_DataProcessing4() | 0;
        //Perform bitwise OR:
        var result = operand1 | operand2;
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR2(result | 0);
    }
    MOV() {
        //Perform move:
        //Update destination register:
        this.guard12OffsetRegisterWrite(this.operand2OP_DataProcessing1() | 0);
    }
    MOV2() {
        //Increment PC:
        this.incrementProgramCounter();
        //Perform move:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(this.operand2OP_DataProcessing3() | 0);
    }
    MOVS() {
        var operand2 = this.operand2OP_DataProcessing2() | 0;
        //Perform move:
        this.branchFlags.setNZInt(operand2 | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR(operand2 | 0);
    }
    MOVS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand2 = this.operand2OP_DataProcessing4() | 0;
        //Perform move:
        this.branchFlags.setNZInt(operand2 | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR2(operand2 | 0);
    }
    BIC() {
        var operand1 = this.read16OffsetRegister() | 0;
        //NOT operand 2:
        var operand2 = ~this.operand2OP_DataProcessing1();
        //Perform bitwise AND:
        //Update destination register:
        this.guard12OffsetRegisterWrite(operand1 & operand2);
    }
    BIC2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        //NOT operand 2:
        var operand2 = ~this.operand2OP_DataProcessing3();
        //Perform bitwise AND:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(operand1 & operand2);
    }
    BICS() {
        var operand1 = this.read16OffsetRegister() | 0;
        //NOT operand 2:
        var operand2 = ~this.operand2OP_DataProcessing2();
        //Perform bitwise AND:
        var result = operand1 & operand2;
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR(result | 0);
    }
    BICS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand1 = this.read16OffsetRegister() | 0;
        //NOT operand 2:
        var operand2 = ~this.operand2OP_DataProcessing4();
        //Perform bitwise AND:
        var result = operand1 & operand2;
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR2(result | 0);
    }
    MVN() {
        //Perform move negative:
        //Update destination register:
        this.guard12OffsetRegisterWrite(~this.operand2OP_DataProcessing1());
    }
    MVN2() {
        //Increment PC:
        this.incrementProgramCounter();
        //Perform move negative:
        //Update destination register:
        this.guard12OffsetRegisterWrite2(~this.operand2OP_DataProcessing3());
    }
    MVNS() {
        var operand2 = ~this.operand2OP_DataProcessing2();
        //Perform move negative:
        this.branchFlags.setNZInt(operand2 | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR(operand2 | 0);
    }
    MVNS2() {
        //Increment PC:
        this.incrementProgramCounter();
        var operand2 = ~this.operand2OP_DataProcessing4();
        //Perform move negative:
        this.branchFlags.setNZInt(operand2 | 0);
        //Update destination register and guard CPSR for PC:
        this.guard12OffsetRegisterWriteCPSR2(operand2 | 0);
    }
    MRS() {
        //Transfer PSR to Register:
        var psr = 0;
        if ((this.execute & 0x400000) == 0) {
            //CPSR->Register
            psr = this.rc() | 0;
        } else {
            //SPSR->Register
            psr = this.rs() | 0;
        }
        this.guard12OffsetRegisterWrite(psr | 0);
    }
    MSR() {
        switch (this.execute & 0x2400000) {
            case 0:
                //Reg->CPSR
                this.MSR1();
                break;
            case 0x400000:
                //Reg->SPSR
                this.MSR2();
                break;
            case 0x2000000:
                //Immediate->CPSR
                this.MSR3();
                break;
            default:
                //Immediate->SPSR
                this.MSR4();
        }
        //Increment PC:
        this.incrementProgramCounter();
    }
    MSR1() {
        var newcpsr = this.read0OffsetRegister() | 0;
        this.branchFlags.setNZCV(newcpsr | 0);
        if ((this.execute & 0x10000) != 0 && (this.CPUCore.modeFlags & 0x1f) != 0x10) {
            this.CPUCore.switchRegisterBank(newcpsr & 0x1f);
            this.CPUCore.modeFlags = newcpsr & 0xdf;
            this.CPUCore.assertIRQ();
        }
    }
    MSR2() {
        var operand = this.read0OffsetRegister() | 0;
        var bank = 1;
        switch (this.CPUCore.modeFlags & 0x1f) {
            case 0x12: //IRQ
                break;
            case 0x13: //Supervisor
                bank = 2;
                break;
            case 0x11: //FIQ
                bank = 0;
                break;
            case 0x17: //Abort
                bank = 3;
                break;
            case 0x1b: //Undefined
                bank = 4;
                break;
            default:
                return;
        }
        var spsr = (operand >> 20) & 0xf00;
        if ((this.execute & 0x10000) != 0) {
            spsr = spsr | (operand & 0xff);
        } else {
            spsr = spsr | (this.CPUCore.SPSR[bank | 0] & 0xff);
        }
        this.CPUCore.SPSR[bank | 0] = spsr | 0;
    }
    MSR3() {
        var operand = this.imm() | 0;
        this.branchFlags.setNZCV(operand | 0);
    }
    MSR4() {
        var operand = this.imm() >> 20;
        var bank = 1;
        switch (this.CPUCore.modeFlags & 0x1f) {
            case 0x12: //IRQ
                break;
            case 0x13: //Supervisor
                bank = 2;
                break;
            case 0x11: //FIQ
                bank = 0;
                break;
            case 0x17: //Abort
                bank = 3;
                break;
            case 0x1b: //Undefined
                bank = 4;
                break;
            default:
                return;
        }
        var spsr = this.CPUCore.SPSR[bank | 0] & 0xff;
        this.CPUCore.SPSR[bank | 0] = spsr | (operand & 0xf00);
    }
    MUL() {
        //Perform multiplication:
        var result = this.performMUL32() | 0;
        //Update destination register:
        this.multiplyGuard16OffsetRegisterWrite(result | 0);
    }
    MULS() {
        //Perform multiplication:
        var result = this.performMUL32() | 0;
        this.branchFlags.setCarryFalse();
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.multiplyGuard16OffsetRegisterWrite(result | 0);
    }
    MLA() {
        //Perform multiplication:
        var result = this.performMUL32MLA() | 0;
        //Perform addition:
        result = ((result | 0) + (this.read12OffsetRegister() | 0)) | 0;
        //Update destination register:
        this.multiplyGuard16OffsetRegisterWrite(result | 0);
    }
    MLAS() {
        //Perform multiplication:
        var result = this.performMUL32MLA() | 0;
        //Perform addition:
        result = ((result | 0) + (this.read12OffsetRegister() | 0)) | 0;
        this.branchFlags.setCarryFalse();
        this.branchFlags.setNZInt(result | 0);
        //Update destination register and guard CPSR for PC:
        this.multiplyGuard16OffsetRegisterWrite(result | 0);
    }
    UMULL() {
        //Perform multiplication:
        this.CPUCore.performUMUL64(this.read0OffsetRegister() | 0, this.read8OffsetRegister() | 0);
        //Update destination register:
        this.multiplyGuard16OffsetRegisterWrite(this.CPUCore.mul64ResultHigh | 0);
        this.multiplyGuard12OffsetRegisterWrite(this.CPUCore.mul64ResultLow | 0);
    }
    UMULLS() {
        //Perform multiplication:
        this.CPUCore.performUMUL64(this.read0OffsetRegister() | 0, this.read8OffsetRegister() | 0);
        this.branchFlags.setCarryFalse();
        this.branchFlags.setNegative(this.CPUCore.mul64ResultHigh | 0);
        this.branchFlags.setZero(this.CPUCore.mul64ResultHigh | this.CPUCore.mul64ResultLow);
        //Update destination register and guard CPSR for PC:
        this.multiplyGuard16OffsetRegisterWrite(this.CPUCore.mul64ResultHigh | 0);
        this.multiplyGuard12OffsetRegisterWrite(this.CPUCore.mul64ResultLow | 0);
    }
    UMLAL() {
        //Perform multiplication:
        this.CPUCore.performUMLA64(
            this.read0OffsetRegister() | 0,
            this.read8OffsetRegister() | 0,
            this.read16OffsetRegister() | 0,
            this.read12OffsetRegister() | 0
        );
        //Update destination register:
        this.multiplyGuard16OffsetRegisterWrite(this.CPUCore.mul64ResultHigh | 0);
        this.multiplyGuard12OffsetRegisterWrite(this.CPUCore.mul64ResultLow | 0);
    }
    UMLALS() {
        //Perform multiplication:
        this.CPUCore.performUMLA64(
            this.read0OffsetRegister() | 0,
            this.read8OffsetRegister() | 0,
            this.read16OffsetRegister() | 0,
            this.read12OffsetRegister() | 0
        );
        this.branchFlags.setCarryFalse();
        this.branchFlags.setNegative(this.CPUCore.mul64ResultHigh | 0);
        this.branchFlags.setZero(this.CPUCore.mul64ResultHigh | this.CPUCore.mul64ResultLow);
        //Update destination register and guard CPSR for PC:
        this.multiplyGuard16OffsetRegisterWrite(this.CPUCore.mul64ResultHigh | 0);
        this.multiplyGuard12OffsetRegisterWrite(this.CPUCore.mul64ResultLow | 0);
    }
    SMULL() {
        //Perform multiplication:
        this.CPUCore.performMUL64(this.read0OffsetRegister() | 0, this.read8OffsetRegister() | 0);
        //Update destination register:
        this.multiplyGuard16OffsetRegisterWrite(this.CPUCore.mul64ResultHigh | 0);
        this.multiplyGuard12OffsetRegisterWrite(this.CPUCore.mul64ResultLow | 0);
    }
    SMULLS() {
        //Perform multiplication:
        this.CPUCore.performMUL64(this.read0OffsetRegister() | 0, this.read8OffsetRegister() | 0);
        this.branchFlags.setCarryFalse();
        this.branchFlags.setNegative(this.CPUCore.mul64ResultHigh | 0);
        this.branchFlags.setZero(this.CPUCore.mul64ResultHigh | this.CPUCore.mul64ResultLow);
        //Update destination register and guard CPSR for PC:
        this.multiplyGuard16OffsetRegisterWrite(this.CPUCore.mul64ResultHigh | 0);
        this.multiplyGuard12OffsetRegisterWrite(this.CPUCore.mul64ResultLow | 0);
    }
    SMLAL() {
        //Perform multiplication:
        this.CPUCore.performMLA64(
            this.read0OffsetRegister() | 0,
            this.read8OffsetRegister() | 0,
            this.read16OffsetRegister() | 0,
            this.read12OffsetRegister() | 0
        );
        //Update destination register:
        this.multiplyGuard16OffsetRegisterWrite(this.CPUCore.mul64ResultHigh | 0);
        this.multiplyGuard12OffsetRegisterWrite(this.CPUCore.mul64ResultLow | 0);
    }
    SMLALS() {
        //Perform multiplication:
        this.CPUCore.performMLA64(
            this.read0OffsetRegister() | 0,
            this.read8OffsetRegister() | 0,
            this.read16OffsetRegister() | 0,
            this.read12OffsetRegister() | 0
        );
        this.branchFlags.setCarryFalse();
        this.branchFlags.setNegative(this.CPUCore.mul64ResultHigh | 0);
        this.branchFlags.setZero(this.CPUCore.mul64ResultHigh | this.CPUCore.mul64ResultLow);
        //Update destination register and guard CPSR for PC:
        this.multiplyGuard16OffsetRegisterWrite(this.CPUCore.mul64ResultHigh | 0);
        this.multiplyGuard12OffsetRegisterWrite(this.CPUCore.mul64ResultLow | 0);
    }
    STRH() {
        //Perform halfword store calculations:
        var address = this.operand2OP_LoadStore1() | 0;
        //Write to memory location:
        this.CPUCore.write16(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRH() {
        //Perform halfword load calculations:
        var address = this.operand2OP_LoadStore1() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read16(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDRSH() {
        //Perform signed halfword load calculations:
        var address = this.operand2OP_LoadStore1() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite((this.CPUCore.read16(address | 0) << 16) >> 16);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDRSB() {
        //Perform signed byte load calculations:
        var address = this.operand2OP_LoadStore1() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite((this.CPUCore.read8(address | 0) << 24) >> 24);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRH2() {
        //Perform halfword store calculations:
        var address = this.operand2OP_LoadStore2() | 0;
        //Write to memory location:
        this.CPUCore.write16(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRH2() {
        //Perform halfword load calculations:
        var address = this.operand2OP_LoadStore2() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read16(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDRSH2() {
        //Perform signed halfword load calculations:
        var address = this.operand2OP_LoadStore2() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite((this.CPUCore.read16(address | 0) << 16) >> 16);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDRSB2() {
        //Perform signed byte load calculations:
        var address = this.operand2OP_LoadStore2() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite((this.CPUCore.read8(address | 0) << 24) >> 24);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STR() {
        //Perform word store calculations:
        var address = this.operand2OP_LoadStore3Normal() | 0;
        //Write to memory location:
        this.CPUCore.write32(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDR() {
        //Perform word load calculations:
        var address = this.operand2OP_LoadStore3Normal() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read32(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRB() {
        //Perform byte store calculations:
        var address = this.operand2OP_LoadStore3Normal() | 0;
        //Write to memory location:
        this.CPUCore.write8(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRB() {
        //Perform byte store calculations:
        var address = this.operand2OP_LoadStore3Normal() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read8(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STR4() {
        //Perform word store calculations:
        var address = this.operand2OP_LoadStore4() | 0;
        //Write to memory location:
        this.CPUCore.write32(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDR4() {
        //Perform word load calculations:
        var address = this.operand2OP_LoadStore4() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read32(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRB4() {
        //Perform byte store calculations:
        var address = this.operand2OP_LoadStore4() | 0;
        //Write to memory location:
        this.CPUCore.write8(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRB4() {
        //Perform byte store calculations:
        var address = this.operand2OP_LoadStore4() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read8(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRT() {
        //Perform word store calculations (forced user-mode):
        var address = this.operand2OP_LoadStore3User() | 0;
        //Write to memory location:
        this.CPUCore.write32(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRT() {
        //Perform word load calculations (forced user-mode):
        var address = this.operand2OP_LoadStore3User() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read32(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRBT() {
        //Perform byte store calculations (forced user-mode):
        var address = this.operand2OP_LoadStore3User() | 0;
        //Write to memory location:
        this.CPUCore.write8(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRBT() {
        //Perform byte load calculations (forced user-mode):
        var address = this.operand2OP_LoadStore3User() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read8(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STR2() {
        //Perform word store calculations:
        var address = this.operand2OP_LoadStore5Normal() | 0;
        //Write to memory location:
        this.CPUCore.write32(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDR2() {
        //Perform word load calculations:
        var address = this.operand2OP_LoadStore5Normal() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read32(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRB2() {
        //Perform byte store calculations:
        var address = this.operand2OP_LoadStore5Normal() | 0;
        //Write to memory location:
        this.CPUCore.write8(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRB2() {
        //Perform byte store calculations:
        var address = this.operand2OP_LoadStore5Normal() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read8(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRT2() {
        //Perform word store calculations (forced user-mode):
        var address = this.operand2OP_LoadStore5User() | 0;
        //Write to memory location:
        this.CPUCore.write32(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRT2() {
        //Perform word load calculations (forced user-mode):
        var address = this.operand2OP_LoadStore5User() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read32(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRBT2() {
        //Perform byte store calculations (forced user-mode):
        var address = this.operand2OP_LoadStore5User() | 0;
        //Write to memory location:
        this.CPUCore.write8(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRBT2() {
        //Perform byte load calculations (forced user-mode):
        var address = this.operand2OP_LoadStore5User() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read8(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STR3() {
        //Perform word store calculations:
        var address = this.operand2OP_LoadStore6() | 0;
        //Write to memory location:
        this.CPUCore.write32(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDR3() {
        //Perform word load calculations:
        var address = this.operand2OP_LoadStore6() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read32(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STRB3() {
        //Perform byte store calculations:
        var address = this.operand2OP_LoadStore6() | 0;
        //Write to memory location:
        this.CPUCore.write8(address | 0, this.guard12OffsetRegisterRead() | 0);
    }
    LDRB3() {
        //Perform byte store calculations:
        var address = this.operand2OP_LoadStore6() | 0;
        //Read from memory location:
        this.guard12OffsetRegisterWrite(this.CPUCore.read8(address | 0) | 0);
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    STMIA() {
        //Only initialize the STMIA sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    this.memory.memoryWrite32(currentAddress | 0, this.readRegister(rListPosition | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMIAW() {
        //Only initialize the STMIA sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            var finalAddress = this.getPositiveOffsetStartAddress(currentAddress | 0) | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            var count = 0;
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    this.memory.memoryWrite32(currentAddress | 0, this.readRegister(rListPosition | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    //Compute writeback immediately after the first register load:
                    if ((count | 0) == 0) {
                        count = 1;
                        //Store the updated base address back into register:
                        this.guard16OffsetRegisterWrite(finalAddress | 0);
                    }
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMDA() {
        //Only initialize the STMDA sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Get offset start address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.memory.memoryWrite32(currentAddress | 0, this.readRegister(rListPosition | 0) | 0);
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMDAW() {
        //Only initialize the STMDA sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Get offset start address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            var finalAddress = currentAddress | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            var count = 0;
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.memory.memoryWrite32(currentAddress | 0, this.readRegister(rListPosition | 0) | 0);
                    //Compute writeback immediately after the first register load:
                    if ((count | 0) == 0) {
                        count = 1;
                        //Store the updated base address back into register:
                        this.guard16OffsetRegisterWrite(finalAddress | 0);
                    }
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMIB() {
        //Only initialize the STMIB sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.memory.memoryWrite32(currentAddress | 0, this.readRegister(rListPosition | 0) | 0);
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMIBW() {
        //Only initialize the STMIB sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            var finalAddress = this.getPositiveOffsetStartAddress(currentAddress | 0) | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            var count = 0;
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.memory.memoryWrite32(currentAddress | 0, this.readRegister(rListPosition | 0) | 0);
                    //Compute writeback immediately after the first register load:
                    if ((count | 0) == 0) {
                        count = 1;
                        //Store the updated base address back into register:
                        this.guard16OffsetRegisterWrite(finalAddress | 0);
                    }
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMDB() {
        //Only initialize the STMDB sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Get offset start address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    this.memory.memoryWrite32(currentAddress | 0, this.readRegister(rListPosition | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMDBW() {
        //Only initialize the STMDB sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Get offset start address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            var finalAddress = currentAddress | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            var count = 0;
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    this.memory.memoryWrite32(currentAddress | 0, this.readRegister(rListPosition | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    //Compute writeback immediately after the first register load:
                    if ((count | 0) == 0) {
                        count = 1;
                        //Store the updated base address back into register:
                        this.guard16OffsetRegisterWrite(finalAddress | 0);
                    }
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMIAG() {
        //Only initialize the STMIA sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    this.memory.memoryWrite32(currentAddress | 0, this.guardUserRegisterRead(rListPosition | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMIAWG() {
        //Only initialize the STMIA sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            var finalAddress = this.getPositiveOffsetStartAddress(currentAddress | 0) | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            var count = 0;
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    this.memory.memoryWrite32(currentAddress | 0, this.guardUserRegisterRead(rListPosition | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    //Compute writeback immediately after the first register load:
                    if ((count | 0) == 0) {
                        count = 1;
                        //Store the updated base address back into register:
                        this.guard16OffsetRegisterWrite(finalAddress | 0);
                    }
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMDAG() {
        //Only initialize the STMDA sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Get offset start address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.memory.memoryWrite32(currentAddress | 0, this.guardUserRegisterRead(rListPosition | 0) | 0);
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMDAWG() {
        //Only initialize the STMDA sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Get offset start address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            var finalAddress = currentAddress | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            var count = 0;
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.memory.memoryWrite32(currentAddress | 0, this.guardUserRegisterRead(rListPosition | 0) | 0);
                    //Compute writeback immediately after the first register load:
                    if ((count | 0) == 0) {
                        count = 1;
                        //Store the updated base address back into register:
                        this.guard16OffsetRegisterWrite(finalAddress | 0);
                    }
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMIBG() {
        //Only initialize the STMIB sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.memory.memoryWrite32(currentAddress | 0, this.guardUserRegisterRead(rListPosition | 0) | 0);
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMIBWG() {
        //Only initialize the STMIB sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            var finalAddress = this.getPositiveOffsetStartAddress(currentAddress | 0) | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            var count = 0;
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.memory.memoryWrite32(currentAddress | 0, this.guardUserRegisterRead(rListPosition | 0) | 0);
                    //Compute writeback immediately after the first register load:
                    if ((count | 0) == 0) {
                        count = 1;
                        //Store the updated base address back into register:
                        this.guard16OffsetRegisterWrite(finalAddress | 0);
                    }
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMDBG() {
        //Only initialize the STMDB sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Get offset start address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    this.memory.memoryWrite32(currentAddress | 0, this.guardUserRegisterRead(rListPosition | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    STMDBWG() {
        //Only initialize the STMDB sequence if the register list is non-empty:
        if ((this.execute & 0xffff) > 0) {
            //Get the base address:
            var currentAddress = this.read16OffsetRegister() | 0;
            //Get offset start address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            var finalAddress = currentAddress | 0;
            //Updating the address bus away from PC fetch:
            this.wait.NonSequentialBroadcast();
            //Push register(s) into memory:
            var count = 0;
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Push a register into memory:
                    this.memory.memoryWrite32(currentAddress | 0, this.guardUserRegisterRead(rListPosition | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    //Compute writeback immediately after the first register load:
                    if ((count | 0) == 0) {
                        count = 1;
                        //Store the updated base address back into register:
                        this.guard16OffsetRegisterWrite(finalAddress | 0);
                    }
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        }
    }
    LDMIA() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    this.guardRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
        } else {
            //Empty reglist loads PC:
            this.guardRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMIAW() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    this.guardRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
        } else {
            //Empty reglist loads PC:
            this.guardRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
            currentAddress = ((currentAddress | 0) + 0x40) | 0;
        }
        //Store the updated base address back into register:
        this.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMDA() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Get the offset address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            //Load register(s) from memory:
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.guardRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                }
            }
            //Updating the address bus back to PC fetch:
            this.wait.NonSequentialBroadcast();
        } else {
            //Empty reglist loads PC:
            this.guardRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMDAW() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Get the offset address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            var writebackAddress = currentAddress | 0;
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.guardRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                }
            }
            //Store the updated base address back into register:
            this.guard16OffsetRegisterWrite(writebackAddress | 0);
        } else {
            //Empty reglist loads PC:
            this.guardRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
            currentAddress = ((currentAddress | 0) - 0x40) | 0;
            //Store the updated base address back into register:
            this.guard16OffsetRegisterWrite(currentAddress | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMIB() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.guardRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                }
            }
        } else {
            //Empty reglist loads PC:
            currentAddress = ((currentAddress | 0) + 4) | 0;
            this.guardRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMIBW() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.guardRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                }
            }
        } else {
            //Empty reglist loads PC:
            currentAddress = ((currentAddress | 0) + 0x40) | 0;
            this.guardRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Store the updated base address back into register:
        this.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMDB() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Get the offset address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            //Load register(s) from memory:
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    this.guardRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
        } else {
            //Empty reglist loads PC:
            currentAddress = ((currentAddress | 0) - 4) | 0;
            this.guardRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMDBW() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Get the offset address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            var writebackAddress = currentAddress | 0;
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    this.guardRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
            //Store the updated base address back into register:
            this.guard16OffsetRegisterWrite(writebackAddress | 0);
        } else {
            //Empty reglist loads PC:
            currentAddress = ((currentAddress | 0) - 0x40) | 0;
            this.guardRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
            //Store the updated base address back into register:
            this.guard16OffsetRegisterWrite(currentAddress | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMIAG() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    this.guardUserRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
        } else {
            //Empty reglist loads PC:
            this.guardProgramCounterRegisterWriteCPSR(this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMIAWG() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    this.guardUserRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
        } else {
            //Empty reglist loads PC:
            this.guardProgramCounterRegisterWriteCPSR(this.memory.memoryRead32(currentAddress | 0) | 0);
            currentAddress = ((currentAddress | 0) + 0x40) | 0;
        }
        //Store the updated base address back into register:
        this.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMDAG() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Get the offset address:
        currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.guardUserRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                }
            }
        } else {
            //Empty reglist loads PC:
            this.guardUserRegisterWriteLDM(0xf, this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMDAWG() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Get the offset address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            var writebackAddress = currentAddress | 0;
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.guardUserRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                }
            }
            //Store the updated base address back into register:
            this.guard16OffsetRegisterWrite(writebackAddress | 0);
        } else {
            //Empty reglist loads PC:
            this.guardProgramCounterRegisterWriteCPSR(this.memory.memoryRead32(currentAddress | 0) | 0);
            currentAddress = ((currentAddress | 0) - 0x40) | 0;
            //Store the updated base address back into register:
            this.guard16OffsetRegisterWrite(currentAddress | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMIBG() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.guardUserRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                }
            }
        } else {
            //Empty reglist loads PC:
            currentAddress = ((currentAddress | 0) + 4) | 0;
            this.guardProgramCounterRegisterWriteCPSR(this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMIBWG() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                    this.guardUserRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                }
            }
        } else {
            //Empty reglist loads PC:
            currentAddress = ((currentAddress | 0) + 0x40) | 0;
            this.guardProgramCounterRegisterWriteCPSR(this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Store the updated base address back into register:
        this.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMDBG() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Get the offset address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            //Load register(s) from memory:
            for (var rListPosition = 0; (rListPosition | 0) < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    this.guardUserRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
        } else {
            //Empty reglist loads PC:
            currentAddress = ((currentAddress | 0) - 4) | 0;
            this.guardProgramCounterRegisterWriteCPSR(this.memory.memoryRead32(currentAddress | 0) | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LDMDBWG() {
        //Get the base address:
        var currentAddress = this.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        this.wait.NonSequentialBroadcast();
        if ((this.execute & 0xffff) > 0) {
            //Get the offset address:
            currentAddress = this.getNegativeOffsetStartAddress(currentAddress | 0) | 0;
            var writebackAddress = currentAddress | 0;
            //Load register(s) from memory:
            for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
                if ((this.execute & (1 << rListPosition)) != 0) {
                    //Load a register from memory:
                    this.guardUserRegisterWriteLDM(rListPosition | 0, this.memory.memoryRead32(currentAddress | 0) | 0);
                    currentAddress = ((currentAddress | 0) + 4) | 0;
                }
            }
            //Store the updated base address back into register:
            this.guard16OffsetRegisterWrite(writebackAddress | 0);
        } else {
            //Empty reglist loads PC:
            currentAddress = ((currentAddress | 0) - 0x40) | 0;
            this.guardProgramCounterRegisterWriteCPSR(this.memory.memoryRead32(currentAddress | 0) | 0);
            //Store the updated base address back into register:
            this.guard16OffsetRegisterWrite(currentAddress | 0);
        }
        //Updating the address bus back to PC fetch:
        this.wait.NonSequentialBroadcast();
        //Internal Cycle:
        this.wait.CPUInternalSingleCyclePrefetch();
    }
    LoadStoreMultiple() {
        this.incrementProgramCounter();
        switch ((this.execute >> 20) & 0x1f) {
            case 0:
                this.STMDA();
                break;
            case 0x1:
                this.LDMDA();
                break;
            case 0x2:
                this.STMDAW();
                break;
            case 0x3:
                this.LDMDAW();
                break;
            case 0x4:
                this.STMDAG();
                break;
            case 0x5:
                this.LDMDAG();
                break;
            case 0x6:
                this.STMDAWG();
                break;
            case 0x7:
                this.LDMDAWG();
                break;
            case 0x8:
                this.STMIA();
                break;
            case 0x9:
                this.LDMIA();
                break;
            case 0xa:
                this.STMIAW();
                break;
            case 0xb:
                this.LDMIAW();
                break;
            case 0xc:
                this.STMIAG();
                break;
            case 0xd:
                this.LDMIAG();
                break;
            case 0xe:
                this.STMIAWG();
                break;
            case 0xf:
                this.LDMIAWG();
                break;
            case 0x10:
                this.STMDB();
                break;
            case 0x11:
                this.LDMDB();
                break;
            case 0x12:
                this.STMDBW();
                break;
            case 0x13:
                this.LDMDBW();
                break;
            case 0x14:
                this.STMDBG();
                break;
            case 0x15:
                this.LDMDBG();
                break;
            case 0x16:
                this.STMDBWG();
                break;
            case 0x17:
                this.LDMDBWG();
                break;
            case 0x18:
                this.STMIB();
                break;
            case 0x19:
                this.LDMIB();
                break;
            case 0x1a:
                this.STMIBW();
                break;
            case 0x1b:
                this.LDMIBW();
                break;
            case 0x1c:
                this.STMIBG();
                break;
            case 0x1d:
                this.LDMIBG();
                break;
            case 0x1e:
                this.STMIBWG();
                break;
            default:
                this.LDMIBWG();
        }
    }
    SWP() {
        var base = this.read16OffsetRegister() | 0;
        var data = this.CPUCore.read32(base | 0) | 0;
        //Clock a cycle for the processing delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        this.CPUCore.write32(base | 0, this.read0OffsetRegister() | 0);
        this.guard12OffsetRegisterWrite(data | 0);
    }
    SWPB() {
        var base = this.read16OffsetRegister() | 0;
        var data = this.CPUCore.read8(base | 0) | 0;
        //Clock a cycle for the processing delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        this.CPUCore.write8(base | 0, this.read0OffsetRegister() | 0);
        this.guard12OffsetRegisterWrite(data | 0);
    }
    SWI() {
        //Software Interrupt:
        this.CPUCore.SWI();
    }
    UNDEFINED() {
        //Undefined Exception:
        this.CPUCore.UNDEFINED();
    }
    operand2OP_DataProcessing1() {
        var data = 0;
        switch ((this.execute & 0x2000060) >> 5) {
            case 0:
                data = this.lli() | 0;
                break;
            case 1:
                data = this.lri() | 0;
                break;
            case 2:
                data = this.ari() | 0;
                break;
            case 3:
                data = this.rri() | 0;
                break;
            default:
                data = this.imm() | 0;
        }
        return data | 0;
    }
    operand2OP_DataProcessing2() {
        var data = 0;
        switch ((this.execute & 0x2000060) >> 5) {
            case 0:
                data = this.llis() | 0;
                break;
            case 1:
                data = this.lris() | 0;
                break;
            case 2:
                data = this.aris() | 0;
                break;
            case 3:
                data = this.rris() | 0;
                break;
            default:
                data = this.imms() | 0;
        }
        return data | 0;
    }
    operand2OP_DataProcessing3() {
        var data = 0;
        switch ((this.execute >> 5) & 0x3) {
            case 0:
                data = this.llr() | 0;
                break;
            case 1:
                data = this.lrr() | 0;
                break;
            case 2:
                data = this.arr() | 0;
                break;
            default:
                data = this.rrr() | 0;
        }
        return data | 0;
    }
    operand2OP_DataProcessing4() {
        var data = 0;
        switch ((this.execute >> 5) & 0x3) {
            case 0:
                data = this.llrs() | 0;
                break;
            case 1:
                data = this.lrrs() | 0;
                break;
            case 2:
                data = this.arrs() | 0;
                break;
            default:
                data = this.rrrs() | 0;
        }
        return data | 0;
    }
    operand2OP_LoadStoreOffsetGen() {
        var data = 0;
        switch ((this.execute >> 5) & 0x3) {
            case 0:
                data = this.lli() | 0;
                break;
            case 1:
                data = this.lri() | 0;
                break;
            case 2:
                data = this.ari() | 0;
                break;
            default:
                data = this.rri() | 0;
        }
        return data | 0;
    }
    operand2OP_LoadStoreOperandDetermine() {
        var offset = 0;
        if ((this.execute & 0x400000) == 0) {
            offset = this.read0OffsetRegister() | 0;
        } else {
            offset = ((this.execute & 0xf00) >> 4) | (this.execute & 0xf);
        }
        return offset | 0;
    }
    operand2OP_LoadStorePostTUser(offset) {
        offset = offset | 0;
        var base = this.read16OffsetUserRegister() | 0;
        if ((this.execute & 0x800000) == 0) {
            offset = ((base | 0) - (offset | 0)) | 0;
        } else {
            offset = ((base | 0) + (offset | 0)) | 0;
        }
        this.guard16OffsetUserRegisterWrite(offset | 0);
        return base | 0;
    }
    operand2OP_LoadStorePostTNormal(offset) {
        offset = offset | 0;
        var base = this.read16OffsetRegister() | 0;
        if ((this.execute & 0x800000) == 0) {
            offset = ((base | 0) - (offset | 0)) | 0;
        } else {
            offset = ((base | 0) + (offset | 0)) | 0;
        }
        this.guard16OffsetRegisterWrite(offset | 0);
        return base | 0;
    }
    operand2OP_LoadStoreNotT(offset) {
        offset = offset | 0;
        var base = this.read16OffsetRegister() | 0;
        if ((this.execute & 0x800000) == 0) {
            offset = ((base | 0) - (offset | 0)) | 0;
        } else {
            offset = ((base | 0) + (offset | 0)) | 0;
        }
        if ((this.execute & 0x200000) != 0) {
            this.guard16OffsetRegisterWrite(offset | 0);
        }
        return offset | 0;
    }
    operand2OP_LoadStore1() {
        return this.operand2OP_LoadStorePostTNormal(this.operand2OP_LoadStoreOperandDetermine() | 0) | 0;
    }
    operand2OP_LoadStore2() {
        return this.operand2OP_LoadStoreNotT(this.operand2OP_LoadStoreOperandDetermine() | 0) | 0;
    }
    operand2OP_LoadStore3Normal() {
        return this.operand2OP_LoadStorePostTNormal(this.execute & 0xfff) | 0;
    }
    operand2OP_LoadStore3User() {
        return this.operand2OP_LoadStorePostTUser(this.execute & 0xfff) | 0;
    }
    operand2OP_LoadStore4() {
        return this.operand2OP_LoadStoreNotT(this.execute & 0xfff) | 0;
    }
    operand2OP_LoadStore5Normal() {
        return this.operand2OP_LoadStorePostTNormal(this.operand2OP_LoadStoreOffsetGen() | 0) | 0;
    }
    operand2OP_LoadStore5User() {
        return this.operand2OP_LoadStorePostTUser(this.operand2OP_LoadStoreOffsetGen() | 0) | 0;
    }
    operand2OP_LoadStore6() {
        return this.operand2OP_LoadStoreNotT(this.operand2OP_LoadStoreOffsetGen() | 0) | 0;
    }
    lli() {
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Shift the register data left:
        var shifter = (this.execute >> 7) & 0x1f;
        return register << (shifter | 0);
    }
    llis() {
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Get the shift amount:
        var shifter = (this.execute >> 7) & 0x1f;
        //Check to see if we need to update CPSR:
        if ((shifter | 0) > 0) {
            this.branchFlags.setCarry(register << (((shifter | 0) - 1) | 0));
        }
        //Shift the register data left:
        return register << (shifter | 0);
    }
    llr() {
        //Logical Left Shift with Register:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Clock a cycle for the shift delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        //Shift the register data left:
        var shifter = this.read8OffsetRegister() & 0xff;
        if ((shifter | 0) < 0x20) {
            register = register << (shifter | 0);
        } else {
            register = 0;
        }
        return register | 0;
    }
    llrs() {
        //Logical Left Shift with Register and CPSR:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Clock a cycle for the shift delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        //Get the shift amount:
        var shifter = this.read8OffsetRegister() & 0xff;
        //Check to see if we need to update CPSR:
        if ((shifter | 0) > 0) {
            if ((shifter | 0) < 0x20) {
                //Shift the register data left:
                this.branchFlags.setCarry(register << (((shifter | 0) - 1) | 0));
                register = register << (shifter | 0);
            } else {
                if ((shifter | 0) == 0x20) {
                    //Shift bit 0 into carry:
                    this.branchFlags.setCarry(register << 31);
                } else {
                    //Everything Zero'd:
                    this.branchFlags.setCarryFalse();
                }
                register = 0;
            }
        }
        //If shift is 0, just return the register without mod:
        return register | 0;
    }
    lri() {
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Shift the register data right logically:
        var shifter = (this.execute >> 7) & 0x1f;
        if ((shifter | 0) == 0) {
            //Return 0:
            register = 0;
        } else {
            register = (register >>> (shifter | 0)) | 0;
        }
        return register | 0;
    }
    lris() {
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Get the shift amount:
        var shifter = (this.execute >> 7) & 0x1f;
        //Check to see if we need to update CPSR:
        if ((shifter | 0) > 0) {
            this.branchFlags.setCarry((register >> (((shifter | 0) - 1) | 0)) << 31);
            //Shift the register data right logically:
            register = (register >>> (shifter | 0)) | 0;
        } else {
            this.branchFlags.setCarry(register | 0);
            //Return 0:
            register = 0;
        }
        return register | 0;
    }
    lrr() {
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Clock a cycle for the shift delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        //Shift the register data right logically:
        var shifter = this.read8OffsetRegister() & 0xff;
        if ((shifter | 0) < 0x20) {
            register = (register >>> (shifter | 0)) | 0;
        } else {
            register = 0;
        }
        return register | 0;
    }
    lrrs() {
        //Logical Right Shift with Register and CPSR:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Clock a cycle for the shift delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        //Get the shift amount:
        var shifter = this.read8OffsetRegister() & 0xff;
        //Check to see if we need to update CPSR:
        if ((shifter | 0) > 0) {
            if ((shifter | 0) < 0x20) {
                //Shift the register data right logically:
                this.branchFlags.setCarry((register >> (((shifter | 0) - 1) | 0)) << 31);
                register = (register >>> (shifter | 0)) | 0;
            } else {
                if ((shifter | 0) == 0x20) {
                    //Shift bit 31 into carry:
                    this.branchFlags.setCarry(register | 0);
                } else {
                    //Everything Zero'd:
                    this.branchFlags.setCarryFalse();
                }
                register = 0;
            }
        }
        //If shift is 0, just return the register without mod:
        return register | 0;
    }
    ari() {
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Get the shift amount:
        var shifter = (this.execute >> 7) & 0x1f;
        if ((shifter | 0) == 0) {
            //Shift full length if shifter is zero:
            shifter = 0x1f;
        }
        //Shift the register data right:
        return register >> (shifter | 0);
    }
    aris() {
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Get the shift amount:
        var shifter = (this.execute >> 7) & 0x1f;
        //Check to see if we need to update CPSR:
        if ((shifter | 0) > 0) {
            this.branchFlags.setCarry((register >> (((shifter | 0) - 1) | 0)) << 31);
        } else {
            //Shift full length if shifter is zero:
            shifter = 0x1f;
            this.branchFlags.setCarry(register | 0);
        }
        //Shift the register data right:
        return register >> (shifter | 0);
    }
    arr() {
        //Arithmetic Right Shift with Register:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Clock a cycle for the shift delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        //Shift the register data right:
        return register >> Math.min(this.read8OffsetRegister() & 0xff, 0x1f);
    }
    arrs() {
        //Arithmetic Right Shift with Register and CPSR:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Clock a cycle for the shift delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        //Get the shift amount:
        var shifter = this.read8OffsetRegister() & 0xff;
        //Check to see if we need to update CPSR:
        if ((shifter | 0) > 0) {
            if ((shifter | 0) < 0x20) {
                //Shift the register data right arithmetically:
                this.branchFlags.setCarry((register >> (((shifter | 0) - 1) | 0)) << 31);
                register = register >> (shifter | 0);
            } else {
                //Set all bits with bit 31:
                this.branchFlags.setCarry(register | 0);
                register = register >> 0x1f;
            }
        }
        //If shift is 0, just return the register without mod:
        return register | 0;
    }
    rri() {
        //Rotate Right with Immediate:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Rotate the register right:
        var shifter = (this.execute >> 7) & 0x1f;
        if ((shifter | 0) > 0) {
            //ROR
            register = (register << (0x20 - (shifter | 0))) | (register >>> (shifter | 0));
        } else {
            //RRX
            register = (this.branchFlags.getCarry() & 0x80000000) | (register >>> 0x1);
        }
        return register | 0;
    }
    rris() {
        //Rotate Right with Immediate and CPSR:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Rotate the register right:
        var shifter = (this.execute >> 7) & 0x1f;
        if ((shifter | 0) > 0) {
            //ROR
            this.branchFlags.setCarry((register >> (((shifter | 0) - 1) | 0)) << 31);
            register = (register << (0x20 - (shifter | 0))) | (register >>> (shifter | 0));
        } else {
            //RRX
            var rrxValue = (this.branchFlags.getCarry() & 0x80000000) | (register >>> 0x1);
            this.branchFlags.setCarry(register << 31);
            register = rrxValue | 0;
        }
        return register | 0;
    }
    rrr() {
        //Rotate Right with Register:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Clock a cycle for the shift delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        //Rotate the register right:
        var shifter = this.read8OffsetRegister() & 0x1f;
        if ((shifter | 0) > 0) {
            //ROR
            register = (register << (0x20 - (shifter | 0))) | (register >>> (shifter | 0));
        }
        //If shift is 0, just return the register without mod:
        return register | 0;
    }
    rrrs() {
        //Rotate Right with Register and CPSR:
        //Get the register data to be shifted:
        var register = this.read0OffsetRegister() | 0;
        //Clock a cycle for the shift delaying the CPU:
        this.wait.CPUInternalSingleCyclePrefetch();
        //Rotate the register right:
        var shifter = this.read8OffsetRegister() & 0xff;
        if ((shifter | 0) > 0) {
            shifter = shifter & 0x1f;
            if ((shifter | 0) > 0) {
                //ROR
                this.branchFlags.setCarry((register >> (((shifter | 0) - 1) | 0)) << 31);
                register = (register << (0x20 - (shifter | 0))) | (register >>> (shifter | 0));
            } else {
                //No shift, but make carry set to bit 31:
                this.branchFlags.setCarry(register | 0);
            }
        }
        //If shift is 0, just return the register without mod:
        return register | 0;
    }
    imm() {
        //Get the immediate data to be shifted:
        var immediate = this.execute & 0xff;
        //Rotate the immediate right:
        var shifter = (this.execute >> 7) & 0x1e;
        if ((shifter | 0) > 0) {
            immediate = (immediate << (0x20 - (shifter | 0))) | (immediate >>> (shifter | 0));
        }
        return immediate | 0;
    }
    imms() {
        //Get the immediate data to be shifted:
        var immediate = this.execute & 0xff;
        //Rotate the immediate right:
        var shifter = (this.execute >> 7) & 0x1e;
        if ((shifter | 0) > 0) {
            immediate = (immediate << (0x20 - (shifter | 0))) | (immediate >>> (shifter | 0));
            this.branchFlags.setCarry(immediate | 0);
        }
        return immediate | 0;
    }
    rc() {
        return this.branchFlags.getNZCV() | this.CPUCore.modeFlags;
    }
    rs() {
        var spsr = 0;
        switch (this.CPUCore.modeFlags & 0x1f) {
            case 0x12: //IRQ
                spsr = this.CPUCore.SPSR[1] | 0;
                break;
            case 0x13: //Supervisor
                spsr = this.CPUCore.SPSR[2] | 0;
                break;
            case 0x11: //FIQ
                spsr = this.CPUCore.SPSR[0] | 0;
                break;
            case 0x17: //Abort
                spsr = this.CPUCore.SPSR[3] | 0;
                break;
            case 0x1b: //Undefined
                spsr = this.CPUCore.SPSR[4] | 0;
                break;
            default:
                //Instruction hit an invalid SPSR request:
                return this.rc() | 0;
        }
        return ((spsr & 0xf00) << 20) | (spsr & 0xff);
    }
}

function compileARMInstructionDecodeMap() {
    var pseudoCodes = [
        'LDRH',
        'MOVS2',
        'MUL',
        'MSR',
        'LDRSH',
        'MVN2',
        'SMLAL',
        'RSCS',
        'CMPS',
        'MRS',
        'RSBS2',
        'ADDS',
        'SUBS',
        'RSB',
        'SUBS2',
        'MULS',
        'SMLALS',
        'STRB',
        'CMNS2',
        'UMLALS',
        'ORR2',
        'BX',
        'RSBS',
        'LDRSB',
        'LoadStoreMultiple',
        'ANDS2',
        'BIC',
        'ADD2',
        'SBC2',
        'AND',
        'TSTS2',
        'MOV2',
        'MOVS',
        'EOR',
        'ORRS2',
        'RSC',
        'LDR2',
        'SMULLS',
        'LDRSB2',
        'LDRB4',
        'BL',
        'LDRB3',
        'SBCS2',
        'MVNS2',
        'MLAS',
        'MVN',
        'BICS2',
        'UMLAL',
        'CMPS2',
        'LDRB',
        'RSC2',
        'ADC2',
        'LDRSH2',
        'ORR',
        'ADDS2',
        'EOR2',
        'STR3',
        'UMULL',
        'ADD',
        'LDRH2',
        'STRB4',
        'LDR4',
        'EORS',
        'ORRS',
        'BICS',
        'SMULL',
        'EORS2',
        'B',
        'STR',
        'STRH',
        'TEQS',
        'STR2',
        'STRH2',
        'AND2',
        'SUB',
        'MVNS',
        'ADC',
        'ADCS',
        'MOV',
        'CMNS',
        'ADCS2',
        'TSTS',
        'RSCS2',
        'ANDS',
        'STRB3',
        'SBC',
        'STR4',
        'LDR',
        'LDR3',
        'SUB2',
        'STRB2',
        'SWP',
        'TEQS2',
        'UMULLS',
        'BIC2',
        'MLA',
        'SWI',
        'LDRB2',
        'SBCS',
        'RSB2',
        'SWPB',
        'STRT',
        'LDRT',
        'STRBT',
        'LDRBT',
        'STRT2',
        'LDRT2',
        'STRBT2',
        'LDRBT2',
    ];
    function compileARMInstructionDecodeOpcodeMap(codeMap) {
        var opcodeIndice = 0;
        var instructionMap = getUint8Array(4096);
        function generateMap1(instruction) {
            for (var index = 0; index < 0x10; ++index) {
                instructionMap[opcodeIndice++] = codeMap[instruction[index]];
            }
        }
        function generateMap2(instruction) {
            var translatedOpcode = codeMap[instruction];
            for (var index = 0; index < 0x10; ++index) {
                instructionMap[opcodeIndice++] = translatedOpcode;
            }
        }
        function generateMap3(instruction) {
            var translatedOpcode = codeMap[instruction];
            for (var index = 0; index < 0x100; ++index) {
                instructionMap[opcodeIndice++] = translatedOpcode;
            }
        }
        function generateMap4(instruction) {
            var translatedOpcode = codeMap[instruction];
            for (var index = 0; index < 0x200; ++index) {
                instructionMap[opcodeIndice++] = translatedOpcode;
            }
        }
        function generateMap5(instruction) {
            var translatedOpcode = codeMap[instruction];
            for (var index = 0; index < 0x300; ++index) {
                instructionMap[opcodeIndice++] = translatedOpcode;
            }
        }
        function generateStoreLoadInstructionSector1() {
            var instrMap = ['STR2', 'LDR2', 'STRT2', 'LDRT2', 'STRB2', 'LDRB2', 'STRBT2', 'LDRBT2'];
            for (var instrIndex = 0; instrIndex < 0x10; ++instrIndex) {
                for (var dataIndex = 0; dataIndex < 0x10; ++dataIndex) {
                    if ((dataIndex & 0x1) == 0) {
                        instructionMap[opcodeIndice++] = codeMap[instrMap[instrIndex & 0x7]];
                    } else {
                        instructionMap[opcodeIndice++] = codeMap['UNDEFINED'];
                    }
                }
            }
        }
        function generateStoreLoadInstructionSector2() {
            var instrMap = ['STR3', 'LDR3', 'STRB3', 'LDRB3'];
            for (var instrIndex = 0; instrIndex < 0x10; ++instrIndex) {
                for (var dataIndex = 0; dataIndex < 0x10; ++dataIndex) {
                    if ((dataIndex & 0x1) == 0) {
                        instructionMap[opcodeIndice++] = codeMap[instrMap[((instrIndex >> 1) & 0x2) | (instrIndex & 0x1)]];
                    } else {
                        instructionMap[opcodeIndice++] = codeMap['UNDEFINED'];
                    }
                }
            }
        }
        //0
        generateMap1([
            'AND',
            'AND2',
            'AND',
            'AND2',
            'AND',
            'AND2',
            'AND',
            'AND2',
            'AND',
            'MUL',
            'AND',
            'STRH',
            'AND',
            'UNDEFINED',
            'AND',
            'UNDEFINED',
        ]);
        //1
        generateMap1([
            'ANDS',
            'ANDS2',
            'ANDS',
            'ANDS2',
            'ANDS',
            'ANDS2',
            'ANDS',
            'ANDS2',
            'ANDS',
            'MULS',
            'ANDS',
            'LDRH',
            'ANDS',
            'LDRSB',
            'ANDS',
            'LDRSH',
        ]);
        //2
        generateMap1([
            'EOR',
            'EOR2',
            'EOR',
            'EOR2',
            'EOR',
            'EOR2',
            'EOR',
            'EOR2',
            'EOR',
            'MLA',
            'EOR',
            'STRH',
            'EOR',
            'UNDEFINED',
            'EOR',
            'UNDEFINED',
        ]);
        //3
        generateMap1([
            'EORS',
            'EORS2',
            'EORS',
            'EORS2',
            'EORS',
            'EORS2',
            'EORS',
            'EORS2',
            'EORS',
            'MLAS',
            'EORS',
            'LDRH',
            'EORS',
            'LDRSB',
            'EORS',
            'LDRSH',
        ]);
        //4
        generateMap1([
            'SUB',
            'SUB2',
            'SUB',
            'SUB2',
            'SUB',
            'SUB2',
            'SUB',
            'SUB2',
            'SUB',
            'UNDEFINED',
            'SUB',
            'STRH',
            'SUB',
            'UNDEFINED',
            'SUB',
            'UNDEFINED',
        ]);
        //5
        generateMap1([
            'SUBS',
            'SUBS2',
            'SUBS',
            'SUBS2',
            'SUBS',
            'SUBS2',
            'SUBS',
            'SUBS2',
            'SUBS',
            'UNDEFINED',
            'SUBS',
            'LDRH',
            'SUBS',
            'LDRSB',
            'SUBS',
            'LDRSH',
        ]);
        //6
        generateMap1([
            'RSB',
            'RSB2',
            'RSB',
            'RSB2',
            'RSB',
            'RSB2',
            'RSB',
            'RSB2',
            'RSB',
            'UNDEFINED',
            'RSB',
            'STRH',
            'RSB',
            'UNDEFINED',
            'RSB',
            'UNDEFINED',
        ]);
        //7
        generateMap1([
            'RSBS',
            'RSBS2',
            'RSBS',
            'RSBS2',
            'RSBS',
            'RSBS2',
            'RSBS',
            'RSBS2',
            'RSBS',
            'UNDEFINED',
            'RSBS',
            'LDRH',
            'RSBS',
            'LDRSB',
            'RSBS',
            'LDRSH',
        ]);
        //8
        generateMap1([
            'ADD',
            'ADD2',
            'ADD',
            'ADD2',
            'ADD',
            'ADD2',
            'ADD',
            'ADD2',
            'ADD',
            'UMULL',
            'ADD',
            'STRH',
            'ADD',
            'UNDEFINED',
            'ADD',
            'UNDEFINED',
        ]);
        //9
        generateMap1([
            'ADDS',
            'ADDS2',
            'ADDS',
            'ADDS2',
            'ADDS',
            'ADDS2',
            'ADDS',
            'ADDS2',
            'ADDS',
            'UMULLS',
            'ADDS',
            'LDRH',
            'ADDS',
            'LDRSB',
            'ADDS',
            'LDRSH',
        ]);
        //A
        generateMap1([
            'ADC',
            'ADC2',
            'ADC',
            'ADC2',
            'ADC',
            'ADC2',
            'ADC',
            'ADC2',
            'ADC',
            'UMLAL',
            'ADC',
            'STRH',
            'ADC',
            'UNDEFINED',
            'ADC',
            'UNDEFINED',
        ]);
        //B
        generateMap1([
            'ADCS',
            'ADCS2',
            'ADCS',
            'ADCS2',
            'ADCS',
            'ADCS2',
            'ADCS',
            'ADCS2',
            'ADCS',
            'UMLALS',
            'ADCS',
            'LDRH',
            'ADCS',
            'LDRSB',
            'ADCS',
            'LDRSH',
        ]);
        //C
        generateMap1([
            'SBC',
            'SBC2',
            'SBC',
            'SBC2',
            'SBC',
            'SBC2',
            'SBC',
            'SBC2',
            'SBC',
            'SMULL',
            'SBC',
            'STRH',
            'SBC',
            'UNDEFINED',
            'SBC',
            'UNDEFINED',
        ]);
        //D
        generateMap1([
            'SBCS',
            'SBCS2',
            'SBCS',
            'SBCS2',
            'SBCS',
            'SBCS2',
            'SBCS',
            'SBCS2',
            'SBCS',
            'SMULLS',
            'SBCS',
            'LDRH',
            'SBCS',
            'LDRSB',
            'SBCS',
            'LDRSH',
        ]);
        //E
        generateMap1([
            'RSC',
            'RSC2',
            'RSC',
            'RSC2',
            'RSC',
            'RSC2',
            'RSC',
            'RSC2',
            'RSC',
            'SMLAL',
            'RSC',
            'STRH',
            'RSC',
            'UNDEFINED',
            'RSC',
            'UNDEFINED',
        ]);
        //F
        generateMap1([
            'RSCS',
            'RSCS2',
            'RSCS',
            'RSCS2',
            'RSCS',
            'RSCS2',
            'RSCS',
            'RSCS2',
            'RSCS',
            'SMLALS',
            'RSCS',
            'LDRH',
            'RSCS',
            'LDRSB',
            'RSCS',
            'LDRSH',
        ]);
        //10
        generateMap1([
            'MRS',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'SWP',
            'UNDEFINED',
            'STRH2',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
        ]);
        //11
        generateMap1([
            'TSTS',
            'TSTS2',
            'TSTS',
            'TSTS2',
            'TSTS',
            'TSTS2',
            'TSTS',
            'TSTS2',
            'TSTS',
            'UNDEFINED',
            'TSTS',
            'LDRH2',
            'TSTS',
            'LDRSB2',
            'TSTS',
            'LDRSH2',
        ]);
        //12
        generateMap1([
            'MSR',
            'BX',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'STRH2',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
        ]);
        //13
        generateMap1([
            'TEQS',
            'TEQS2',
            'TEQS',
            'TEQS2',
            'TEQS',
            'TEQS2',
            'TEQS',
            'TEQS2',
            'TEQS',
            'UNDEFINED',
            'TEQS',
            'LDRH2',
            'TEQS',
            'LDRSB2',
            'TEQS',
            'LDRSH2',
        ]);
        //14
        generateMap1([
            'MRS',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'SWPB',
            'UNDEFINED',
            'STRH2',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
        ]);
        //15
        generateMap1([
            'CMPS',
            'CMPS2',
            'CMPS',
            'CMPS2',
            'CMPS',
            'CMPS2',
            'CMPS',
            'CMPS2',
            'CMPS',
            'UNDEFINED',
            'CMPS',
            'LDRH2',
            'CMPS',
            'LDRSB2',
            'CMPS',
            'LDRSH2',
        ]);
        //16
        generateMap1([
            'MSR',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'STRH2',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
            'UNDEFINED',
        ]);
        //17
        generateMap1([
            'CMNS',
            'CMNS2',
            'CMNS',
            'CMNS2',
            'CMNS',
            'CMNS2',
            'CMNS',
            'CMNS2',
            'CMNS',
            'UNDEFINED',
            'CMNS',
            'LDRH2',
            'CMNS',
            'LDRSB2',
            'CMNS',
            'LDRSH2',
        ]);
        //18
        generateMap1([
            'ORR',
            'ORR2',
            'ORR',
            'ORR2',
            'ORR',
            'ORR2',
            'ORR',
            'ORR2',
            'ORR',
            'UNDEFINED',
            'ORR',
            'STRH2',
            'ORR',
            'UNDEFINED',
            'ORR',
            'UNDEFINED',
        ]);
        //19
        generateMap1([
            'ORRS',
            'ORRS2',
            'ORRS',
            'ORRS2',
            'ORRS',
            'ORRS2',
            'ORRS',
            'ORRS2',
            'ORRS',
            'UNDEFINED',
            'ORRS',
            'LDRH2',
            'ORRS',
            'LDRSB2',
            'ORRS',
            'LDRSH2',
        ]);
        //1A
        generateMap1([
            'MOV',
            'MOV2',
            'MOV',
            'MOV2',
            'MOV',
            'MOV2',
            'MOV',
            'MOV2',
            'MOV',
            'UNDEFINED',
            'MOV',
            'STRH2',
            'MOV',
            'UNDEFINED',
            'MOV',
            'UNDEFINED',
        ]);
        //1B
        generateMap1([
            'MOVS',
            'MOVS2',
            'MOVS',
            'MOVS2',
            'MOVS',
            'MOVS2',
            'MOVS',
            'MOVS2',
            'MOVS',
            'UNDEFINED',
            'MOVS',
            'LDRH2',
            'MOVS',
            'LDRSB2',
            'MOVS',
            'LDRSH2',
        ]);
        //1C
        generateMap1([
            'BIC',
            'BIC2',
            'BIC',
            'BIC2',
            'BIC',
            'BIC2',
            'BIC',
            'BIC2',
            'BIC',
            'UNDEFINED',
            'BIC',
            'STRH2',
            'BIC',
            'UNDEFINED',
            'BIC',
            'UNDEFINED',
        ]);
        //1D
        generateMap1([
            'BICS',
            'BICS2',
            'BICS',
            'BICS2',
            'BICS',
            'BICS2',
            'BICS',
            'BICS2',
            'BICS',
            'UNDEFINED',
            'BICS',
            'LDRH2',
            'BICS',
            'LDRSB2',
            'BICS',
            'LDRSH2',
        ]);
        //1E
        generateMap1([
            'MVN',
            'MVN2',
            'MVN',
            'MVN2',
            'MVN',
            'MVN2',
            'MVN',
            'MVN2',
            'MVN',
            'UNDEFINED',
            'MVN',
            'STRH2',
            'MVN',
            'UNDEFINED',
            'MVN',
            'UNDEFINED',
        ]);
        //1F
        generateMap1([
            'MVNS',
            'MVNS2',
            'MVNS',
            'MVNS2',
            'MVNS',
            'MVNS2',
            'MVNS',
            'MVNS2',
            'MVNS',
            'UNDEFINED',
            'MVNS',
            'LDRH2',
            'MVNS',
            'LDRSB2',
            'MVNS',
            'LDRSH2',
        ]);
        //20
        generateMap2('AND');
        //21
        generateMap2('ANDS');
        //22
        generateMap2('EOR');
        //23
        generateMap2('EORS');
        //24
        generateMap2('SUB');
        //25
        generateMap2('SUBS');
        //26
        generateMap2('RSB');
        //27
        generateMap2('RSBS');
        //28
        generateMap2('ADD');
        //29
        generateMap2('ADDS');
        //2A
        generateMap2('ADC');
        //2B
        generateMap2('ADCS');
        //2C
        generateMap2('SBC');
        //2D
        generateMap2('SBCS');
        //2E
        generateMap2('RSC');
        //2F
        generateMap2('RSCS');
        //30
        generateMap2('UNDEFINED');
        //31
        generateMap2('TSTS');
        //32
        generateMap2('MSR');
        //33
        generateMap2('TEQS');
        //34
        generateMap2('UNDEFINED');
        //35
        generateMap2('CMPS');
        //36
        generateMap2('MSR');
        //37
        generateMap2('CMNS');
        //38
        generateMap2('ORR');
        //39
        generateMap2('ORRS');
        //3A
        generateMap2('MOV');
        //3B
        generateMap2('MOVS');
        //3C
        generateMap2('BIC');
        //3D
        generateMap2('BICS');
        //3E
        generateMap2('MVN');
        //3F
        generateMap2('MVNS');
        //40
        generateMap2('STR');
        //41
        generateMap2('LDR');
        //42
        generateMap2('STRT');
        //43
        generateMap2('LDRT');
        //44
        generateMap2('STRB');
        //45
        generateMap2('LDRB');
        //46
        generateMap2('STRBT');
        //47
        generateMap2('LDRBT');
        //48
        generateMap2('STR');
        //49
        generateMap2('LDR');
        //4A
        generateMap2('STRT');
        //4B
        generateMap2('LDRT');
        //4C
        generateMap2('STRB');
        //4D
        generateMap2('LDRB');
        //4E
        generateMap2('STRBT');
        //4F
        generateMap2('LDRBT');
        //50
        generateMap2('STR4');
        //51
        generateMap2('LDR4');
        //52
        generateMap2('STR4');
        //53
        generateMap2('LDR4');
        //54
        generateMap2('STRB4');
        //55
        generateMap2('LDRB4');
        //56
        generateMap2('STRB4');
        //57
        generateMap2('LDRB4');
        //58
        generateMap2('STR4');
        //59
        generateMap2('LDR4');
        //5A
        generateMap2('STR4');
        //5B
        generateMap2('LDR4');
        //5C
        generateMap2('STRB4');
        //5D
        generateMap2('LDRB4');
        //5E
        generateMap2('STRB4');
        //5F
        generateMap2('LDRB4');
        //60-6F
        generateStoreLoadInstructionSector1();
        //70-7F
        generateStoreLoadInstructionSector2();
        //80-9F
        generateMap4('LoadStoreMultiple');
        //A0-AF
        generateMap3('B');
        //B0-BF
        generateMap3('BL');
        //C0-EF
        generateMap5('UNDEFINED');
        //F0-FF
        generateMap3('SWI');
        //Set to prototype:
        ARMInstructionSet.prototype.instructionMap = instructionMap;
    }
    function compileARMInstructionDecodeOpcodeSwitch() {
        var opcodeNameMap = {};
        //ARMInstructionSet.prototype.opcodeCount = [];
        var opcodeCount = pseudoCodes.length | 0;
        var code = 'switch (this.instructionMap[((this.execute >> 16) & 0xFF0) | ((this.execute >> 4) & 0xF)] & 0xFF) {';
        for (var opcodeNumber = 0; (opcodeNumber | 0) < (opcodeCount | 0); opcodeNumber = ((opcodeNumber | 0) + 1) | 0) {
            var opcodeName = pseudoCodes[opcodeNumber | 0];
            opcodeNameMap[opcodeName] = opcodeNumber | 0;
            /*code += "case " + (opcodeNumber | 0) + ":{this." + opcodeName + "();++ARMInstructionSet.prototype.opcodeCount[" + opcodeNumber + "][1];break};";
            ARMInstructionSet.prototype.opcodeCount[opcodeNumber | 0] = [opcodeName, 0];*/
            code += 'case ' + (opcodeNumber | 0) + ':{this.' + opcodeName + '();break};';
        }
        code += 'default:{this.UNDEFINED()}}';
        opcodeNameMap['UNDEFINED'] = opcodeNumber | 0;
        ARMInstructionSet.prototype.executeDecoded = Function(code);
        return opcodeNameMap;
    }
    compileARMInstructionDecodeOpcodeMap(compileARMInstructionDecodeOpcodeSwitch());
}
compileARMInstructionDecodeMap();
/*function sortPriority() {
    var sorted = ARMInstructionSet.prototype.opcodeCount.sort(function(a, b) {
                return b[1] - a[1];
                });
    var output = "[\n";
    var length = sorted.length - 1;
    for (var index = 0; index <= length; index++) {
        output += "\t\"" + sorted[index][0] + "\"" + ((index < length) ? "," : "") + "\n";
    }
    output += "];";
    console.log(output);
}*/
