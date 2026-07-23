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

test("los pesos personalizados cambian el ranking de similitud", () => {
  const rows = [
    {
      Player: "Objetivo",
      Team: "Club A",
      Position: "RWF",
      Age: 21,
      "Minutes played": 1500,
      "Goals per 90": 1,
      "xG per 90": 1,
      "Shots per 90": 1,
    },
    {
      Player: "Especialista en gol",
      Team: "Club B",
      Position: "LWF",
      Age: 21,
      "Minutes played": 1500,
      "Goals per 90": 1,
      "xG per 90": 0,
      "Shots per 90": 0,
    },
    {
      Player: "Perfil general",
      Team: "Club C",
      Position: "RWF",
      Age: 21,
      "Minutes played": 1500,
      "Goals per 90": 0,
      "xG per 90": 1,
      "Shots per 90": 1,
    },
  ];
  const filters = {
    query: "",
    ageMin: null,
    ageMax: null,
    minimumMinutes: 0,
    passport: "",
    position: "",
  };

  const neutral = buildSimilaritySearch(rows, 0, filters);
  const weighted = buildSimilaritySearch(rows, 0, filters, { "Goals per 90": 3, "xG per 90": 0.25, "Shots per 90": 0.25 });
  const contextOnly = buildSimilaritySearch(rows, 0, filters, { "Goals per 90": 0, "xG per 90": 0, "Shots per 90": 0 });

  assert.equal(neutral?.candidates[0].name, "Perfil general");
  assert.equal(weighted?.candidates[0].name, "Especialista en gol");
  assert.equal(weighted?.candidates[0].metrics.find((metric) => metric.key === "Goals per 90")?.weight, 3);
  assert.equal(contextOnly?.candidates[0].similarity, contextOnly?.candidates[0].contextSimilarity);
});
