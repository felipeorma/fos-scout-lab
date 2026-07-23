import assert from "node:assert/strict";
import test from "node:test";
import { buildSimilaritySearch, playerPassports, similarityOptions } from "../lib/similarity.ts";

test("separa pasaportes principales y secundarios sin duplicarlos", () => {
  assert.deepEqual(playerPassports("Chile, Canadá / chile; Argentina"), ["Chile", "Canadá", "Argentina"]);
});

test("ordena alfabéticamente cada pasaporte individual", () => {
  const options = similarityOptions([
    { "Passport country": "Uruguay, Argentina" },
    { "Passport country": "Canadá / Brasil" },
  ]);

  assert.deepEqual(options.passports, ["Argentina", "Brasil", "Canadá", "Uruguay"]);
});

test("filtra por un pasaporte secundario del jugador", () => {
  const rows = [
    {
      Player: "Jugador objetivo",
      Team: "Club A",
      Position: "RWF",
      Age: 21,
      "Passport country": "Chile",
      "Matches played": 20,
      "Minutes played": 1500,
      "Goals per 90": 0.4,
      "xG per 90": 0.35,
      "Shots per 90": 2.8,
    },
    {
      Player: "Jugador comparable",
      Team: "Club B",
      Position: "LWF",
      Age: 22,
      "Passport country": "Argentina, Canadá",
      "Matches played": 18,
      "Minutes played": 1400,
      "Goals per 90": 0.38,
      "xG per 90": 0.33,
      "Shots per 90": 2.6,
    },
  ];

  const result = buildSimilaritySearch(rows, 0, {
    query: "",
    ageMin: null,
    ageMax: null,
    minimumMinutes: 0,
    passport: "Canadá",
    position: "",
  });

  assert.equal(result?.candidates.length, 1);
  assert.equal(result?.candidates[0].name, "Jugador comparable");
  assert.equal(result?.candidates[0].passport, "Argentina, Canadá");
});
