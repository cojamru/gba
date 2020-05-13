'use strict';
/*
 Copyright (C) 2012-2015 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GameBoyAdvanceChannel1Synth {
    constructor(sound) {
        this.sound = sound;
        this.currentSampleLeft = 0;
        this.currentSampleRight = 0;
        this.SweepFault = false;
        this.lastTimeSweep = 0;
        this.timeSweep = 0;
        this.frequencySweepDivider = 0;
        this.decreaseSweep = false;
        this.nr11 = 0;
        this.CachedDuty = 0xf0000000;
        this.totalLength = 0x40;
        this.nr12 = 0;
        this.envelopeVolume = 0;
        this.frequency = 0;
        this.FrequencyTracker = 0x8000;
        this.nr14 = 0;
        this.consecutive = true;
        this.ShadowFrequency = 0x8000;
        this.canPlay = false;
        this.Enabled = 0;
        this.envelopeSweeps = 0;
        this.envelopeSweepsLast = -1;
        this.FrequencyCounter = 0;
        this.DutyTracker = 0;
        this.Swept = false;
        this.leftEnable = 0;
        this.rightEnable = 0;
    }
    disabled() {
        //Clear NR10:
        this.nr10 = 0;
        this.SweepFault = false;
        this.lastTimeSweep = 0;
        this.timeSweep = 0;
        this.frequencySweepDivider = 0;
        this.decreaseSweep = false;
        //Clear NR11:
        this.nr11 = 0;
        this.CachedDuty = 0xf0000000;
        this.totalLength = 0x40;
        //Clear NR12:
        this.nr12 = 0;
        this.envelopeVolume = 0;
        //Clear NR13:
        this.frequency = 0;
        this.FrequencyTracker = 0x8000;
        //Clear NR14:
        this.nr14 = 0;
        this.consecutive = true;
        this.ShadowFrequency = 0x8000;
        this.canPlay = false;
        this.Enabled = 0;
        this.envelopeSweeps = 0;
        this.envelopeSweepsLast = -1;
        this.FrequencyCounter = 0;
        this.DutyTracker = 0;
    }
    clockAudioLength() {
        if ((this.totalLength | 0) > 1) {
            this.totalLength = ((this.totalLength | 0) - 1) | 0;
        } else if ((this.totalLength | 0) == 1) {
            this.totalLength = 0;
            this.enableCheck();
            this.sound.unsetNR52(0xfe); //Channel #1 On Flag Off
        }
    }
    enableCheck() {
        if ((this.consecutive || (this.totalLength | 0) > 0) && !this.SweepFault && this.canPlay) {
            this.Enabled = 0xf;
        } else {
            this.Enabled = 0;
        }
    }
    volumeEnableCheck() {
        this.canPlay = (this.nr12 | 0) > 7;
        this.enableCheck();
    }
    outputLevelCache() {
        var duty = this.CachedDuty >> (this.DutyTracker | 0);
        var envelopeVolume = this.envelopeVolume & this.Enabled & duty;
        this.currentSampleLeft = this.leftEnable & envelopeVolume;
        this.currentSampleRight = this.rightEnable & envelopeVolume;
    }
    setChannelOutputEnable(data) {
        data = data | 0;
        //Set by NR51 handler:
        this.rightEnable = (data << 31) >> 31;
        this.leftEnable = (data << 27) >> 31;
    }
    clockAudioSweep() {
        //Channel 1:
        if (!this.SweepFault && (this.timeSweep | 0) > 0) {
            this.timeSweep = ((this.timeSweep | 0) - 1) | 0;
            if ((this.timeSweep | 0) == 0) {
                this.runAudioSweep();
            }
        }
    }
    runAudioSweep() {
        //Channel 1:
        if ((this.lastTimeSweep | 0) > 0) {
            if ((this.frequencySweepDivider | 0) > 0) {
                this.Swept = true;
                if (this.decreaseSweep) {
                    this.ShadowFrequency = ((this.ShadowFrequency | 0) - (this.ShadowFrequency >> (this.frequencySweepDivider | 0))) | 0;
                    this.frequency = this.ShadowFrequency & 0x7ff;
                    this.FrequencyTracker = (0x800 - (this.frequency | 0)) << 4;
                } else {
                    this.ShadowFrequency = ((this.ShadowFrequency | 0) + (this.ShadowFrequency >> (this.frequencySweepDivider | 0))) | 0;
                    this.frequency = this.ShadowFrequency | 0;
                    if ((this.ShadowFrequency | 0) <= 0x7ff) {
                        this.FrequencyTracker = (0x800 - (this.frequency | 0)) << 4;
                        //Run overflow check twice:
                        if ((((this.ShadowFrequency | 0) + (this.ShadowFrequency >> (this.frequencySweepDivider | 0))) | 0) > 0x7ff) {
                            this.SweepFault = true;
                            this.enableCheck();
                            this.sound.unsetNR52(0xfe); //Channel #1 On Flag Off
                        }
                    } else {
                        this.frequency &= 0x7ff;
                        this.SweepFault = true;
                        this.enableCheck();
                        this.sound.unsetNR52(0xfe); //Channel #1 On Flag Off
                    }
                }
                this.timeSweep = this.lastTimeSweep | 0;
            } else {
                //Channel has sweep disabled and timer becomes a length counter:
                this.SweepFault = true;
                this.enableCheck();
            }
        }
    }
    audioSweepPerformDummy() {
        //Channel 1:
        if ((this.frequencySweepDivider | 0) > 0) {
            if (!this.decreaseSweep) {
                var channel1ShadowFrequency = ((this.ShadowFrequency | 0) + (this.ShadowFrequency >> (this.frequencySweepDivider | 0))) | 0;
                if ((channel1ShadowFrequency | 0) <= 0x7ff) {
                    //Run overflow check twice:
                    if ((((channel1ShadowFrequency | 0) + (channel1ShadowFrequency >> (this.frequencySweepDivider | 0))) | 0) > 0x7ff) {
                        this.SweepFault = true;
                        this.enableCheck();
                        this.sound.unsetNR52(0xfe); //Channel #1 On Flag Off
                    }
                } else {
                    this.SweepFault = true;
                    this.enableCheck();
                    this.sound.unsetNR52(0xfe); //Channel #1 On Flag Off
                }
            }
        }
    }
    clockAudioEnvelope() {
        if ((this.envelopeSweepsLast | 0) > -1) {
            if ((this.envelopeSweeps | 0) > 0) {
                this.envelopeSweeps = ((this.envelopeSweeps | 0) - 1) | 0;
            } else {
                if (!this.envelopeType) {
                    if ((this.envelopeVolume | 0) > 0) {
                        this.envelopeVolume = ((this.envelopeVolume | 0) - 1) | 0;
                        this.envelopeSweeps = this.envelopeSweepsLast | 0;
                    } else {
                        this.envelopeSweepsLast = -1;
                    }
                } else if ((this.envelopeVolume | 0) < 0xf) {
                    this.envelopeVolume = ((this.envelopeVolume | 0) + 1) | 0;
                    this.envelopeSweeps = this.envelopeSweepsLast | 0;
                } else {
                    this.envelopeSweepsLast = -1;
                }
            }
        }
    }
    computeAudioChannel() {
        if ((this.FrequencyCounter | 0) == 0) {
            this.FrequencyCounter = this.FrequencyTracker | 0;
            this.DutyTracker = ((this.DutyTracker | 0) + 4) & 0x1c;
        }
    }
    readSOUND1CNT8_0() {
        //NR10:
        return this.nr10 | 0;
    }
    writeSOUND1CNT8_0(data) {
        data = data | 0;
        //NR10:
        if (this.decreaseSweep && (data & 0x08) == 0) {
            if (this.Swept) {
                this.SweepFault = true;
            }
        }
        this.lastTimeSweep = (data & 0x70) >> 4;
        this.frequencySweepDivider = data & 0x07;
        this.decreaseSweep = (data & 0x08) != 0;
        this.nr10 = data & 0xff;
        this.enableCheck();
    }
    readSOUND1CNT8_2() {
        //NR11:
        return this.nr11 | 0;
    }
    writeSOUND1CNT8_2(data) {
        data = data | 0;
        //NR11:
        switch ((data >> 6) & 0x3) {
            case 0:
                this.CachedDuty = 0xf0000000;
                break;
            case 1:
                this.CachedDuty = 0xf000000f;
                break;
            case 2:
                this.CachedDuty = 0xfff0000f;
                break;
            default:
                this.CachedDuty = 0x0ffffff0;
        }
        this.totalLength = (0x40 - (data & 0x3f)) | 0;
        this.nr11 = data & 0xff;
        this.enableCheck();
    }
    readSOUND1CNT8_3() {
        //NR12:
        return this.nr12 | 0;
    }
    writeSOUND1CNT8_3(data) {
        data = data | 0;
        //NR12:
        this.envelopeType = (data & 0x08) != 0;
        this.nr12 = data & 0xff;
        this.volumeEnableCheck();
    }
    writeSOUND1CNT_X0(data) {
        data = data | 0;
        //NR13:
        this.frequency = (this.frequency & 0x700) | (data & 0xff);
        this.FrequencyTracker = (0x800 - (this.frequency | 0)) << 4;
    }
    readSOUND1CNTX8() {
        //NR14:
        return this.nr14 | 0;
    }
    writeSOUND1CNT_X1(data) {
        data = data | 0;
        //NR14:
        this.consecutive = (data & 0x40) == 0;
        this.frequency = ((data & 0x7) << 8) | (this.frequency & 0xff);
        this.FrequencyTracker = (0x800 - (this.frequency | 0)) << 4;
        if ((data & 0x80) != 0) {
            //Reload nr10:
            this.timeSweep = this.lastTimeSweep | 0;
            this.Swept = false;
            //Reload nr12:
            this.envelopeVolume = this.nr12 >> 4;
            this.envelopeSweepsLast = ((this.nr12 & 0x7) - 1) | 0;
            if ((this.totalLength | 0) == 0) {
                this.totalLength = 0x40;
            }
            if ((this.lastTimeSweep | 0) > 0 || (this.frequencySweepDivider | 0) > 0) {
                this.sound.setNR52(0x1);
            } else {
                this.sound.unsetNR52(0xfe);
            }
            if ((data & 0x40) != 0) {
                this.sound.setNR52(0x1);
            }
            this.ShadowFrequency = this.frequency | 0;
            //Reset frequency overflow check + frequency sweep type check:
            this.SweepFault = false;
            //Supposed to run immediately:
            this.audioSweepPerformDummy();
        }
        this.enableCheck();
        this.nr14 = data & 0xff;
    }
}
