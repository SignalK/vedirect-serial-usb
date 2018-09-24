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
- [ ] Add more unit tests
- [x] Create back door to allow CI tests to complete without failing checksum
