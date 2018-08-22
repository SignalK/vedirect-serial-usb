const join = require('path').join
const stream = require('../lib/filestream')
const Parser = require('../lib/Parser')
const PATH = join(__dirname, './sampleOutput.txt')
const parser = new Parser()

stream.open(PATH, parser)
