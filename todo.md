# TODO

- [x] Reformat code into a Parser class with separate field and product definition
- [x] Make start on unit tests (WIP)
- [x] Include log file for testing
- [x] Expand list of product IDs/devices
- [x] Implement all enums in the VE.direct spec
- [x] Make parser run on entire block, and check checksum for each block
- [x] Test checksum implementation with real Victron device (help needed)
- [x] Emit deltas for entire block, if checksum checks out
- [x] Pass delta on to SK server
- [ ] Test on more Victron devices (help needed)
- [ ] Create back door to allow CI tests to complete without failing checksum

# Notes

- Does a serial port connection need reconnect code (in case of an error or close event)? I assume that this only happens in case of a physical disconnect?
- Checksum code prevents parsing using the log file, but code looks good (checked with peers). Need to test with real data, debug. 
