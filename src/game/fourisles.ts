/** Four islands, beaches, and viridite. Converted once into our own tiles. */
import {
  TILE_BARN,
  TILE_BRIDGE,
  TILE_CLEAR,
  TILE_CLIFF,
  TILE_CRYSTAL,
  TILE_DEEP,
  TILE_HIGH,
  TILE_HUT,
  TILE_RAMP,
  TILE_ROAD,
  TILE_ROCK,
  TILE_ROUGH,
  TILE_SAND,
  TILE_SCRUB,
  TILE_SHALLOW,
  TILE_SHORE,
} from "./data.ts";
import { type EditorDoc } from "./editor.ts";
import { roundCoast } from "./tileset.ts";

const MASK = `
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEC
AgICAgICAgICAgICAgICAgICAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQECAgICAgICAgIBAQEBAQEBAQEBAgICAgICAgICAgICAgICAgICAgICAgICAgIC
AgICAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgIC
AgIBAQEBAQICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgAAAAAABAQEAAQEBAQA
BAAAAAAABAQEAAAAAAICAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQICAgICAgQEBAQEAgICAgICAgICAAAABAQFBAUFBAQEBAQEBAQEBAQEBAQEBAAAAAACAgICAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgICAgACBAQEBAQEAAICAgICAgICAAQE
BAQFBQUFBQQEBAQABAQEBAQEBAQEBAQEAAAAAAICAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAgICAAAEBAQABAQEAAICAgICAAAAAAQEBAQFAgICBAQEBAQEBAQEAAQEBAQEAAQA
AAAAAgICAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgQEBAQEBAQE
BAAAAAAEAAQEBAQABQUEAgICBQQEBAQEAAACAgIAAAAEBAAAAgAAAgICAQEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgQEAAAEBAQEBAQEBAQEBAQEBAQFBQUFBQQFBQQEBAQA
AgICAgICAgIAAAAAAgACAgIBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQICAgAAAgAEBAQEBAQEBAQEBAQEBAQFAAUFAAQABAQAAAICAgICAgICAgICAgICAgICAgIBAQEBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgIAAgAAAAQEBAQEAAQEBAQEBAQA
BQQFBQAEAAAAAgICAgEBAQECAgICAgICAgICAgIBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAgICAgICAAAEAAQEBAQEBAQEBAQEBAQFBAAAAgICAgICAQEBAQECAgICAgIC
AgICAgIBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgICAgICAgAE
BAQEBAQABAQAAAAEBAAEAAACAgICAgEBAQEBAQEBAQEBAQECAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAAAAAAAAAAAAAAAAAwAAAAAAAgICAQEB
AQEBAQEBAQEBAQECAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQECAgICAgICAgICAgICAgICAgICAAAAAAICAgEBAQEBAQEBAQEBAQEBAQECAgIBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgIBAQICAgICAgICAgICAgIC
AgAAAgICAgEBAQEBAQEBAQEBAQEBAQECAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQECAgIBAQECAgICAgICAgICAgICAgICAgIBAQEBAQEBAQEBAQEBAQEBAQEC
AgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgIBAQECAgIBAQEB
AQEBAQEBAQEBAQEBAgICAgEBAQEBAQEBAQEBAQEBAQEBAQECAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAQEBAgICAgICAgECAgIBAQEBAQEBAQEBAQEBAQEBAgICAQEBAQEBAQEB
AQECAgICAgICAgICAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQECAgIC
AgICAgICAgICAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgEBAQEBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAgICAgUEAAAAAgICAgICAgEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgIBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAgICAgUEAAAAAAICAgICAgICAgICAQEBAQEBAQECAgIBAQICAQEBAQEBAQICAgIAAAAAAAAA
AgAAAgICAgEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQECAgIAAAUABQAAAAAAAgAAAgIC
AgICAgEBAQEBAgICAgICAgICAgIBAQEBAgICAgAAAAAAAAACAgAEBAICAgIBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAgICAAUAAAAAAAACAgAAAAICAgICAgIBAQEBAgICAgICAgICAgIBAQEB
AgICAAAAAAAAAAAAAAAEBAACAgIBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAgICAgAA
AAAAAAAAAAAAAAAAAAACAgICAgICAgICAAACAgACAgICAgICAgICAAIAAAAAAAAAAAAEBAQAAgIBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAgICAgICAgIBAQEBAgICAgIAAAAAAAAAAAAAAAAAAgICAgICAgICAgIC
AgICAgICAgICAgICAgICAgIAAAAAAAAAAAQEBAQAAgICAQEBAQEBAQEBAQEBAQEBAgEBAQEBAgICAgIC
AgICAQEBAQECAgIAAAAAAAAAAAAAAAAAAgICAgICAgICAgIAAAICAgIAAgICAgICAgICAAAAAAAAAAAA
AAAEBAQEAgICAgEBAQEBAQEBAQEBAQEBAgEBAQEBAgICAgICAgICAgEBAQECAgIAAAAAAAAAAAAAAAAA
AAACAgIBAQECAgICAgACAAAAAgICAQEBAgICAAAAAAAAAAAAAAAEBAAEBAICAgEBAQEBAgICAgEBAQEB
AgEBAQEBAgICBAAABAACAgEBAQECAgICAAAAAAAAAAAAAAAAAAAAAgIBAQEBAgICAAACAgACAgIBAQEB
AgICAAAAAAAAAAAAAAAEBAQEBAICAgEBAgICAgICAgIBAQEBAgEBAQEBAgICBAQEAAICAgEBAQEBAgIC
AAAAAAAAAAAAAAAAAAAAAgICAQEBAQICAgACAgACAgIBAQECAgIAAAAAAAAAAAAAAAAABAQCAgICAQEB
AgICAgICAgIBAQEBAgEBAQEBAgICBAQAAAICAgEBAQEBAQICAgAAAAAAAAAAAAAAAAAAAgICAgEBAQEC
AgICAgICAQEBAQECAgIAAAAAAAAAAAAAAAAEBAACAgIBAQECAgIABAQEAgIBAQEBAgEBAQEBAgICBAAA
AAICAgICAgICAgICAgACAAAAAAAAAAAAAAAAAAICAgEBAQECAgICAgICAQEBAQECAgIAAAAAAAAAAAAA
AAAAAAACAgIBAQECAgIEBAQCAgIBAQEBAgEBAQEBAgICAAACAgICAgICAgICAgICAgICAAAAAAAAAAAA
AAAAAAICAgEBAQEBAQICAgEBAQEBAgICAgAAAAAAAAAAAAAAAAAAAAICAgEBAQECAgIEAAACAgIBAQEB
AgEBAQECAgIABAACAgICAgICAgICAgICAgAAAAAAAAAAAAAAAAAAAgICAQEBAQEBAQICAgEBAQEBAQIC
AgAAAAAAAAAAAAAAAAAAAAICAgICAgICAgIAAgAAAgIBAQEBAgEBAQECAgIABAAAAAACAgEBAQEBAQIC
AgAAAAAAAAAAAAAAAAAAAgICAQEBAQEBAQICAgEBAQEBAQECAgIAAAAAAAAAAAAAAAACAgICAgICAgIC
AgICAgACAgIBAQEBAgEBAQECAgIEBAQEAAICAgIBAQECAgICAAAAAAAAAAAAAAQABAQAAgIBAQEBAQEB
AQICAgEBAQEBAQECAgICAAAAAAAAAAAAAAACAgICAgICAgICAgIAAAQCAgIBAQEBAgEBAQICAgQEBAQE
AAICAgEBAQECAgIAAAAAAAAAAAAEBAQEBAQCAgIBAQEBAQEBAQICAgEBAQEBAQECAgICAgAAAAAAAAAA
AAAAAAACAgEBAQECAgIEBAQCAgEBAQEBAgEBAQICAgQEBAQAAgICAQEBAQECAgIAAAAAAAAABAQEBAQE
BAACAgIBAQEBAQEBAQICAgEBAQEBAQEBAQICAgAAAAAAAAAAAAAAAAACAgIBAQECAgIEBAQCAgEBAQEB
AgEBAQICAgAEBAQAAgICAQEBAQECAgICAgAEBAQEBAQEAAQEBAICAgIBAQEBAQEBAQICAgIBAQEBAQEB
AQICAgAAAAAAAAAAAAAAAAACAgICAQICAgQEBAICAgEBAQEBAgEBAQICAgIEBAQEAAICAQEBAQECAgIC
AgIABAQEBAQEBAQEAgICAgIBAQEBAQECAgICAgICAQEBAQEBAQICAgICAgICAgIAAAAFBQAAAgICAQIC
AgQEBAICAgEBAQEBAgEBAQECAgIABAQEAAICAgEBAQECAgICAgICAgICAgICAgICAgICAgIBAQEBAQEC
AgICAgICAgEBAQEBAQICAgICAgICAgICAAAEBQUCAgIBAQICAgQEAAICAQEBAQEBAgEBAQEBAgICBAQE
AAICAgIBAQEBAQEBAQICAgICAgICAgICAgEBAQEBAQEBAQECAgICAgICAgEBAQEBAQICAgICAgICAgIC
AgIABQICAgIBAgICBAQEAgICAQEBAQEBAgEBAQEBAgICBAQFBAACAgIBAQEBAQEBAQICAgICAgICAgIC
AQEBAQEBAQEBAQECAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAgICAgICAQECAgICBAQEAgICAQEBAQEB
AgEBAQEBAgICBAQFBAAAAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgICAgEBAQEB
AQEBAQEBAQEBAQEBAgICAgIBAQECAgIEBAQEAgICAQEBAQEBAgEBAQECAgIEBQUEBQQCAgIBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgEBAQECAgIE
BAQEAAICAQEBAQEBAgEBAQECAgIFBQQFBAQCAgIBAQEBAQEBAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgIABQUEBQICAgEBAQEBAgEBAQECAgIFBQUF
BQQCAgIBAQEBAQICAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQICAgIABQUFBQICAgEBAQEBAgEBAQECAgMAAAQFBQICAgEBAQEBAQICAgICAgICAgICAgEC
AQEBAQEBAQEBAQEBAQICAgEBAQEBAQEBAQEBAQEBAQEBAQICAgIBAQEBAQECAgIEBQICAgUCAgIBAQEB
AgEBAQICAgAAAAQFAAICAgEBAQEBAgICBQICAgICAgICAgICAgEBAQEBAQEBAQEBAQICAgEBAQEBAQEC
AgIBAgICAgICAgICAgICAgEBAQECAgICBQICAgICAgIBAQEBAgEBAQICAgAAAAQFAAICAgEBAQEBAgIC
BQUAAgICAgICAgICAgIBAQEBAQEBAQEBAQICAgEBAQEBAQECAgICAgICAgICAgIAAAICAgIBAQEBAgIC
BQUFAAAAAgIBAQEBAgEBAQICAgAEBAQEBAACAgIBAQECAgIFBQQAAAAAAAAAAAAAAgIBAQEBAQEBAQEB
AQICAgEBAQEBAQECAgICAgICAgICAgAFBAACAgICAQEBAQICAgUFBQUCAgIBAQEBAgEBAQICAgIEBAQE
BAACAgIBAQECAgIAAAAAAAAAAAAAAAACAgIBAQEBAQEBAQEBAQICAgEBAQEBAQEBAgIAAAAAAAAAAAUF
BQAAAgICAQEBAQICAgQFBQUCAgIBAQEBAgEBAQECAgIEBAQEBAAAAgIBAQICAgIAAAAAAAAAAAAAAAAC
AgIBAQEBAQEBAQEBAQICAgIBAQEBAQEBAgIAAAAAAAAAAAAFBAAAAAICAQEBAQICAgUFBQUCAgIBAQEB
AgEBAQEBAgICBAQEBAACAgIBAQICAgIAAAAAAAAAAAAAAAACAgIBAQEBAQEBAQECAgICAgICAQEBAQEB
AgIAAAAAAAAAAAAAAAAAAgICAQEBAgICBAQEBAACAgIBAQEBAgEBAQEBAgICBAQEBAACAgIBAQECAgIA
AAAAAAAAAAAAAAAAAgIBAQEBAQEBAQECAgICAgICAgEBAQECAgIAAAAAAAAAAAAAAAAAAgICAQEBAgIC
BAQEBAICAgIBAQEBAgEBAQEBAgICBAQEAAICAgEBAQEBAgICAAAAAAAAAAAAAAAAAgICAQEBAQEBAQIC
AgACAAACAgEBAQECAgICAAAAAAAAAAAAAAAAAAICAQEBAgICBAAEBAICAgEBAQEBAgEBAQEBAgICBAQA
AAICAgICAgICAgICAAIAAAAAAAAAAAAAAgICAgEBAQEBAQICAgICAwICAgEBAQEBAgICAAAAAAAAAAAA
AAAAAgICAQECAgIEBAQEBAICAgEBAQEBAgEBAQEBAgICAAACAgICAgICAgICAgICAgIAAAAAAAAAAAAA
AAICAgEBAQEBAQICAgAAAAICAgEBAQEBAgICAgAAAAAAAAAAAAAAAgICAQECAgIEBAQEAgICAQEBAQEB
AgEBAQICAgIABAACAgICAgICAgICAgICAAAAAAAAAAAAAAAAAAICAgICAgICAgICAgACAAICAgICAgIC
AgICAgACAAAAAAAAAAACAgIBAQECAgIEBAQEAAICAQEBAQEBAgEBAQICAgMABAQAAgICAQEBAQEBAgIC
AAAAAAAAAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAAAAAAACAgICAgICAgIA
AgQEAAICAgEBAQEBAgEBAQICAgAAAAACAgICAQEBAQICAgIAAAAAAAAAAAAAAAACAgICAgICAgICAgIC
AgIAAAICAgICAgICAgICAgAAAAAAAAAAAgICAgICAgICAgICAgQEAwICAgIBAQEBAgEBAQECAgICAgIC
AgEBAQEBAQICAgAAAAAAAAAAAAAAAAAABAACAgICAQEBAQECAgICAgICAQEBAQEBAQICAgAAAAAAAAAA
AgICAgICAgICAgIAAgIEAAACAgIBAQEBAgEBAQECAgICAgICAQEBAQEBAQICAgAAAAAAAAAAAAAAAAAE
BAQAAgICAQEBAQECAgICAgICAQEBAQEBAQICAgAAAAAAAAAAAAACAgIBAQEBAgICAgICAgICAgIBAQEB
AgEBAQEBAQICAgIBAQEBAQEBAQICAgAAAAAAAAAAAAAAAAQEBAQEAgICAQEBAQEBAQICAgEBAQEBAQEB
AgICAAAAAAAAAAAAAAQEAgIBAQEBAgICAgICAgICAgIBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQICAgAA
AAAAAAAAAAAABAQEBAQAAgICAQEBAQEBAQEBAQEBAQEBAQEBAgICAAAAAAAAAAAAAAQEAgICAQEBAQEC
AgICAgICAgIBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAgICAAAAAAAAAAAAAAAEBAAEAAQCAgIBAQEBAQEB
AQEBAQEBAQEBAQEBAgICAAAAAAAAAAAABAQEAgICAgEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAgICAAAAAgAAAAAAAAQEBAQEBAACAgIBAQEBAQEBAQEBAQEBAQEBAQEBAgICAAAAAAAAAAAA
BAQEAAICAgEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAgICAAAAAgAAAAAAAAQEBAQE
BAICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAgICAAAAAAAAAAAABAQEBAQCAQEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAgICAgICAgICAgAAAAICAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAQEB
AgICAAAAAAAAAAQEBAAEBAQCAgEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAgICAgIC
AgICAgIAAgICAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgAAAAAAAAQEBAQEBAQCAgEBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgEBAQEBAQEB
AQEBAQEBAQEBAQEBAQICAgICAAACAAQEAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAQEBAQECAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgICAgACAAAC
AgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgIBAQICAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQICAgICAgICAgICAgICAgICAgEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgIBAQEBAQEBAQEBAQEBAQICAgICAgIBAQEBAQEBAQEBAQEB
AQEBAQECAgICAgICAgICAgICAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEC
AgIBAQEBAQEBAQEBAQECAgICAgICAgICAQEBAQEBAQEBAQEBAQEBAQEBAgICAgIBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgIBAQEBAQECAgICAgICAgICAgICAgIC
AgICAgICAgICAgIBAQEBAQEBAQICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAQEBAQECAgIBAQEBAQECAgICAgICAAUFBQUEBQUCAgICAgICAgICAgICAQEBAQEBAQICAgEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgIC
AgIABAQFAgICBQQEBQICAgICAgICAgICAgICAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAQEBAgICAgICAgICAgIAAAQABAQEBAUEBAQCAgICBAAAAAQAAAAABAAC
AgICAgICAgICAgICAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAgIC
AgICAgICAgQEBAQEBAQEBAUFAAACAgICBQQEBAQEBAQEBAQAAAICAgICAgICAgICAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQECAgIAAgAAAAQEBAQEBAQEBAQEBQUFBAAABQUF
BAQEBAQEBAQEBAQEAAAAAAAAAAACAAACAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAgICAgACAgAABAQEBAQEBAQABAQEBAUFBQUFBQQFBAQEBAQEBAQABAQEBAQEBAQEAAICBAAC
AgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAgICAgICAAAEBAQEBAQEBAQE
BAQEAAUFBAUEBQQEBAQEBAQABAAEBAQEAAQEBAQEBAAABAACAgICAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAgICAgICAAQEAAQEAAQEBAQEBAQEBAQAAAUFAAAEAAQEBAQEBAQEBAAE
BAQEBAQEAAQEBAAAAgICAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQICAgIC
AgICAgIAAwAABAQEBAQEBAACAgICAgAEBAQEBAQABAQEBAQEBAAEBAQEBAQEAwAAAgICAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQICAgICAgICAgICAAACAgAABAAAAAICAgICAgIA
AAAEBAQEBAAEBAAEBAQABAQEBAQEAAACAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAQEBAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAEAAAAAAAAAAQEAAQAAAAAAAQAAAAC
AgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgIC
AgICAgIBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgEBAQEBAQECAgICAgICAgICAgIC
AgICAgICAgICAgICAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgICAgICAgICAgICAgICAgICAgICAgEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
`.replace(/\s/g, "");

const STARTS = [
  [30.5, 34.5],
  [70.5, 31.5],
  [29.5, 65.5],
  [68.5, 65.5],
] as const;

export function layFourIsles(doc: EditorDoc) {
  const raw = Uint8Array.from(atob(MASK), (c) => c.charCodeAt(0));
  doc.terrain.fill(TILE_DEEP);
  doc.crystal.fill(0);
  doc.starts = [];
  for (let i = 0; i < raw.length && i < doc.terrain.length; i++) {
    const n = raw[i] ?? 1;
    if (n === 0 || n === 3) doc.terrain[i] = n === 3 ? TILE_SCRUB : TILE_SAND;
    else if (n === 2) doc.terrain[i] = TILE_SHORE;
    else if (n === 4 || n === 5) {
      doc.terrain[i] = TILE_CRYSTAL;
      doc.crystal[i] = n === 5 ? 1400 : 800;
    } else doc.terrain[i] = TILE_DEEP;
  }
  doc.starts = STARTS.map(([x, y]) => ({ x, y }));
  for (const s of doc.starts) {
    const cx = Math.floor(s.x);
    const cy = Math.floor(s.y);
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (x < 1 || y < 1 || x >= doc.w - 1 || y >= doc.h - 1) continue;
        const i = y * doc.w + x;
        if (doc.terrain[i] === TILE_DEEP || doc.terrain[i] === TILE_SHORE) doc.terrain[i] = TILE_SAND;
        if (doc.terrain[i] === TILE_CRYSTAL) {
          doc.terrain[i] = TILE_SAND;
          doc.crystal[i] = 0;
        }
      }
    }
  }
  roundCoast(doc.terrain, doc.w, doc.h, doc.starts);
  raiseIslands(doc);
  spanChannels(doc);
  layRoads(doc);
  scatterRuins(doc);
  ridgeBars(doc);
}

function cellHash(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function wet(t: number): boolean {
  return t === TILE_DEEP || t === TILE_SHALLOW;
}

function flat(t: number): boolean {
  return t === TILE_SAND || t === TILE_SHORE || t === TILE_SCRUB || t === TILE_CRYSTAL || t === TILE_CLEAR || t === TILE_HIGH || t === TILE_ROAD;
}

function nearStart(doc: EditorDoc, x: number, y: number, r: number): boolean {
  for (const s of doc.starts) {
    if (Math.hypot(s.x - x, s.y - y) < r) return true;
  }
  return false;
}

function raiseIslands(doc: EditorDoc) {
  const w = doc.w;
  const h = doc.h;
  const seen = new Uint8Array(w * h);
  for (const s of doc.starts) {
    const sx = Math.floor(s.x);
    const sy = Math.floor(s.y);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const seed = sy * w + sx;
    if (seen[seed] || !flat(doc.terrain[seed] ?? 0)) continue;
    const blob: number[] = [];
    const stack = [seed];
    seen[seed] = 1;
    while (stack.length) {
      const i = stack.pop() as number;
      blob.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || !flat(doc.terrain[ni] ?? 0)) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    let n = 0;
    const pocket: number[] = [];
    for (const i of blob) {
      const x = i % w;
      const y = (i / w) | 0;
      if (nearStart(doc, x, y, 8) || (doc.crystal[i] ?? 0) > 0) continue;
      if (waterDist(doc, x, y) < 2) continue;
      const t = doc.terrain[i] ?? 0;
      if (t !== TILE_SAND && t !== TILE_SCRUB) continue;
      pocket.push(i);
      n++;
    }
    if (n < 6) continue;
    let best = pocket[0]!;
    let bestH = -1;
    for (const i of pocket) {
      const x = i % w;
      const y = (i / w) | 0;
      const inland = waterDist(doc, x, y);
      if (inland > bestH) {
        bestH = inland;
        best = i;
      }
    }
    const ox = best % w;
    const oy = (best / w) | 0;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (dx * dx + dy * dy > 28) continue;
        const x = ox + dx;
        const y = oy + dy;
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
        if (nearStart(doc, x, y, 7)) continue;
        const i = y * w + x;
        if ((doc.crystal[i] ?? 0) > 0) {
          doc.terrain[i] = TILE_HIGH;
          continue;
        }
        const t = doc.terrain[i] ?? 0;
        if (t !== TILE_SAND && t !== TILE_SCRUB && t !== TILE_SHORE && t !== TILE_CLEAR) continue;
        doc.terrain[i] = TILE_HIGH;
      }
    }
    const cliff: number[] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if ((doc.terrain[i] ?? 0) !== TILE_HIGH) continue;
        if ((doc.crystal[i] ?? 0) > 0) continue;
        if (Math.hypot(x - ox, y - oy) > 6.1) continue;
        let low = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = doc.terrain[(y + dy) * w + (x + dx)] ?? 0;
          if (n === TILE_SAND || n === TILE_SCRUB || n === TILE_SHORE || n === TILE_ROAD || n === TILE_CLEAR) low = true;
        }
        if (low) cliff.push(i);
      }
    }
    for (const i of cliff) doc.terrain[i] = TILE_CLIFF;
    cliff.sort((a, b) => Math.hypot((a % w) - s.x, ((a / w) | 0) - s.y) - Math.hypot((b % w) - s.x, ((b / w) | 0) - s.y));
    for (let k = 0; k < Math.min(2, cliff.length); k++) doc.terrain[cliff[k]!] = TILE_RAMP;
  }
}

function waterDist(doc: EditorDoc, x: number, y: number): number {
  let best = 9;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= doc.w || ny >= doc.h) {
        best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
        continue;
      }
      if (!wet(doc.terrain[ny * doc.w + nx] ?? 0)) continue;
      best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
    }
  }
  return best;
}

function spanChannels(doc: EditorDoc) {
  const used: { x: number; y: number }[] = [];
  const starts = doc.starts.slice();
  for (let i = 0; i < starts.length; i++) {
    let best = -1;
    let bestD = 1e9;
    for (let j = 0; j < starts.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(starts[i]!.x - starts[j]!.x, starts[i]!.y - starts[j]!.y);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0) continue;
    const mid = bridgePair(doc, starts[i]!, starts[best]!);
    if (!mid) continue;
    if (used.some((u) => Math.hypot(u.x - mid.x, u.y - mid.y) < 8)) continue;
    used.push(mid);
    if (used.length >= 4) break;
  }
}

function bridgePair(doc: EditorDoc, a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } | null {
  const cells = line(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y));
  let i = 0;
  while (i < cells.length && !wet(doc.terrain[cells[i]!.y * doc.w + cells[i]!.x] ?? 0)) i++;
  if (i <= 0 || i >= cells.length) return null;
  const start = i;
  while (i < cells.length && wet(doc.terrain[cells[i]!.y * doc.w + cells[i]!.x] ?? 0)) i++;
  const end = i;
  const gap = end - start;
  if (gap < 2 || gap > 16) return null;
  const keep = Math.min(3, gap);
  const eat = gap - keep;
  const eatL = eat >> 1;
  const eatR = eat - eatL;
  const shore = (c: { x: number; y: number } | undefined) => {
    if (!c) return;
    if (c.x < 1 || c.y < 1 || c.x >= doc.w - 1 || c.y >= doc.h - 1) return;
    if (doc.starts.some((s) => Math.floor(s.x) === c.x && Math.floor(s.y) === c.y)) return;
    const i0 = c.y * doc.w + c.x;
    if ((doc.crystal[i0] ?? 0) > 0) return;
    const t = doc.terrain[i0] ?? 0;
    if (t === TILE_BRIDGE || t === TILE_CLIFF || t === TILE_ROCK || t === TILE_HIGH || t === TILE_RAMP) return;
    doc.terrain[i0] = TILE_SHORE;
  };
  for (let k = 0; k < eatL; k++) shore(cells[start + k]);
  for (let k = 0; k < eatR; k++) shore(cells[end - 1 - k]);
  const water = cells.slice(start + eatL, end - eatR);
  if (water.length < 2 || water.length > 6) return null;
  shore(cells[start + eatL - 1]);
  shore(cells[end - eatR]);
  for (const c of water) {
    const i0 = c.y * doc.w + c.x;
    doc.terrain[i0] = TILE_BRIDGE;
    doc.crystal[i0] = 0;
  }
  const mid = water[water.length >> 1]!;
  if (!doc.spans.some((s) => s.tx === mid.x && s.ty === mid.y)) doc.spans.push({ tx: mid.x, ty: mid.y });
  return mid;
}

function line(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x);
  const sx = x < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y);
  const sy = y < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 256; guard++) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

function layRoads(doc: EditorDoc) {
  const goals = doc.spans.map((s) => ({ x: s.tx + 0.5, y: s.ty + 0.5 }));
  goals.push({ x: doc.w / 2, y: doc.h / 2 });
  for (const s of doc.starts) {
    let best = goals[0];
    let bestD = 1e9;
    for (const g of goals) {
      const d = Math.hypot(g.x - s.x, g.y - s.y);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    if (!best) continue;
    stampRoad(doc, s.x, s.y, best.x, best.y);
  }
}

function stampRoad(doc: EditorDoc, x0: number, y0: number, x1: number, y1: number) {
  for (const c of line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1))) {
    if (nearStart(doc, c.x, c.y, 7)) continue;
    if (c.x < 1 || c.y < 1 || c.x >= doc.w - 1 || c.y >= doc.h - 1) continue;
    const i = c.y * doc.w + c.x;
    const t = doc.terrain[i] ?? 0;
    if (wet(t) || t === TILE_BRIDGE) break;
    if (t === TILE_CLIFF || t === TILE_ROCK || t === TILE_RAMP) continue;
    if ((doc.crystal[i] ?? 0) > 0) continue;
    if (t === TILE_SAND || t === TILE_SCRUB || t === TILE_SHORE || t === TILE_CLEAR || t === TILE_HIGH || t === TILE_ROUGH || t === TILE_ROAD) {
      doc.terrain[i] = TILE_ROAD;
    }
  }
}

function scatterRuins(doc: EditorDoc) {
  let rocks = 0;
  let huts = 0;
  for (let y = 2; y < doc.h - 2; y++) {
    for (let x = 2; x < doc.w - 2; x++) {
      const i = y * doc.w + x;
      const t = doc.terrain[i] ?? 0;
      if (t !== TILE_SAND && t !== TILE_SCRUB) continue;
      if ((doc.crystal[i] ?? 0) > 0 || nearStart(doc, x, y, 10)) continue;
      const h = cellHash(x, y);
      if (rocks < 12 && h > 0.982) {
        let wetN = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (wet(doc.terrain[(y + dy) * doc.w + (x + dx)] ?? 0)) wetN++;
        }
        if (wetN) continue;
        doc.terrain[i] = TILE_ROCK;
        if (x + 1 < doc.w - 1 && doc.terrain[i + 1] === TILE_SAND) doc.terrain[i + 1] = TILE_ROCK;
        rocks++;
        continue;
      }
      if (huts < 6 && h > 0.964 && h <= 0.982) {
        const plot = [
          [x, y, TILE_HUT],
          [x + 1, y, TILE_BARN],
          [x, y + 1, TILE_HUT],
        ] as const;
        const open = plot.every(([tx, ty]) => {
          if (tx < 1 || ty < 1 || tx >= doc.w - 1 || ty >= doc.h - 1) return false;
          const ti = ty * doc.w + tx;
          const tt = doc.terrain[ti] ?? 0;
          return (tt === TILE_SAND || tt === TILE_SCRUB) && (doc.crystal[ti] ?? 0) === 0 && !nearStart(doc, tx, ty, 10);
        });
        if (!open) continue;
        for (const [tx, ty, tile] of plot) doc.terrain[ty * doc.w + tx] = tile;
        huts++;
      }
    }
  }
}

/** A cliff bar with one ramp, set on the sand just before each bridge. */
function ridgeBars(doc: EditorDoc) {
  for (const span of doc.spans) {
    for (const s of doc.starts) {
      const dx = span.tx + 0.5 - s.x;
      const dy = span.ty + 0.5 - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8 || dist > 30) continue;
      const ang = Math.atan2(dy, dx);
      const ox = -Math.sin(ang);
      const oy = Math.cos(ang);
      let best: { x: number; y: number; n: number } | null = null;
      for (let along = 6; along <= dist - 3; along += 1) {
        const px = s.x + Math.cos(ang) * along;
        const py = s.y + Math.sin(ang) * along;
        if (nearStart(doc, px, py, 4)) continue;
        const n = barCount(doc, px, py, ox, oy);
        if (n >= 3 && (!best || n > best.n)) best = { x: px, y: py, n };
      }
      if (best) stampBar(doc, best.x, best.y, ox, oy);
    }
  }
  let ramps = 0;
  for (const t of doc.terrain) if (t === TILE_RAMP) ramps++;
  if (ramps >= 4) return;
  for (let y = 2; y < doc.h - 2 && ramps < 4; y++) {
    for (let x = 2; x < doc.w - 2 && ramps < 4; x++) {
      const i = y * doc.w + x;
      if ((doc.terrain[i] ?? 0) !== TILE_CLIFF) continue;
      if (nearStart(doc, x, y, 6)) continue;
      let open = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = doc.terrain[(y + dy) * doc.w + (x + dx)] ?? 0;
        if (n === TILE_SAND || n === TILE_ROAD || n === TILE_CLEAR || n === TILE_HIGH || n === TILE_SHORE) open = true;
      }
      if (!open) continue;
      doc.terrain[i] = TILE_RAMP;
      ramps++;
    }
  }
}

function barCount(doc: EditorDoc, x: number, y: number, ox: number, oy: number): number {
  let n = 0;
  for (let k = -5; k <= 5; k++) {
    const tx = Math.round(x + ox * k);
    const ty = Math.round(y + oy * k);
    if (tx < 2 || ty < 2 || tx >= doc.w - 2 || ty >= doc.h - 2) continue;
    const t = doc.terrain[ty * doc.w + tx] ?? 0;
    if (t === TILE_SAND || t === TILE_ROAD || t === TILE_CLEAR || t === TILE_HIGH || t === TILE_ROUGH || t === TILE_SCRUB) n++;
  }
  return n;
}

function stampBar(doc: EditorDoc, x: number, y: number, ox: number, oy: number) {
  const cells: { i: number; k: number }[] = [];
  for (let k = -5; k <= 5; k++) {
    const tx = Math.round(x + ox * k);
    const ty = Math.round(y + oy * k);
    if (tx < 2 || ty < 2 || tx >= doc.w - 2 || ty >= doc.h - 2) continue;
    if (nearStart(doc, tx, ty, 4)) continue;
    const i = ty * doc.w + tx;
    const t = doc.terrain[i] ?? 0;
    if (t === TILE_BRIDGE || t === TILE_CLIFF || t === TILE_ROCK || t === TILE_RAMP) continue;
    if (t !== TILE_SAND && t !== TILE_SCRUB && t !== TILE_CLEAR && t !== TILE_ROAD && t !== TILE_HIGH && t !== TILE_ROUGH) continue;
    if ((doc.crystal[i] ?? 0) > 0) continue;
    cells.push({ i, k });
  }
  if (cells.length < 3) return;
  cells.sort((a, b) => Math.abs(a.k) - Math.abs(b.k));
  const ramp = cells[0]!.i;
  for (const c of cells) doc.terrain[c.i] = c.i === ramp ? TILE_RAMP : TILE_CLIFF;
}

