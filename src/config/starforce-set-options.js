const starforceSetOptionGroups = Object.freeze([
  {
    id: "arcaneShade",
    label: "아케인셰이드",
    keywords: ["아케인셰이드"],
    tiers: [
      {
        min: 55,
        max: 79,
        stats: {
          finalDamage: 9,
          maxDamage: 50000000,
          physicalAttackPercent: 17,
          physicalDamagePercent: 17,
          magicalAttackPercent: 17,
          magicalDamagePercent: 17,
          bossDamage: 16,
          ignoreDefense: 7
        }
      },
      {
        min: 80,
        max: 104,
        stats: {
          finalDamage: 11,
          maxDamage: 60000000,
          physicalAttackPercent: 19.5,
          physicalDamagePercent: 19.5,
          magicalAttackPercent: 19.5,
          magicalDamagePercent: 19.5,
          bossDamage: 19,
          ignoreDefense: 8
        }
      },
      {
        min: 105,
        max: 129,
        stats: {
          finalDamage: 13,
          maxDamage: 70000000,
          physicalAttackPercent: 22,
          physicalDamagePercent: 22,
          magicalAttackPercent: 22,
          magicalDamagePercent: 22,
          bossDamage: 22,
          ignoreDefense: 9
        }
      },
      {
        min: 130,
        max: 154,
        stats: {
          finalDamage: 15,
          maxDamage: 80000000,
          physicalAttackPercent: 24.5,
          physicalDamagePercent: 24.5,
          magicalAttackPercent: 24.5,
          magicalDamagePercent: 24.5,
          bossDamage: 25,
          ignoreDefense: 10
        }
      },
      {
        min: 155,
        max: 179,
        stats: {
          finalDamage: 17,
          maxDamage: 90000000,
          physicalAttackPercent: 27,
          physicalDamagePercent: 27,
          magicalAttackPercent: 27,
          magicalDamagePercent: 27,
          bossDamage: 28,
          ignoreDefense: 11
        }
      },
      {
        min: 180,
        max: 204,
        stats: {
          finalDamage: 19,
          maxDamage: 100000000,
          physicalAttackPercent: 29.5,
          physicalDamagePercent: 29.5,
          magicalAttackPercent: 29.5,
          magicalDamagePercent: 29.5,
          bossDamage: 31,
          ignoreDefense: 12
        }
      },
      {
        min: 205,
        max: 229,
        stats: {
          finalDamage: 21,
          maxDamage: 130000000,
          physicalAttackPercent: 32,
          physicalDamagePercent: 32,
          magicalAttackPercent: 32,
          magicalDamagePercent: 32,
          bossDamage: 34,
          ignoreDefense: 13
        }
      },
      {
        min: 230,
        max: 254,
        stats: {
          finalDamage: 23,
          maxDamage: 200000000,
          physicalAttackPercent: 34.5,
          physicalDamagePercent: 34.5,
          magicalAttackPercent: 34.5,
          magicalDamagePercent: 34.5,
          bossDamage: 37,
          ignoreDefense: 14
        }
      },
      {
        min: 255,
        max: 279,
        stats: {
          finalDamage: 25,
          maxDamage: 310000000,
          physicalAttackPercent: 37,
          physicalDamagePercent: 37,
          magicalAttackPercent: 37,
          magicalDamagePercent: 37,
          bossDamage: 40,
          ignoreDefense: 15
        }
      },
      {
        min: 280,
        max: 280,
        stats: {
          finalDamage: 27,
          maxDamage: 440000000,
          physicalAttackPercent: 39.5,
          physicalDamagePercent: 39.5,
          magicalAttackPercent: 39.5,
          magicalDamagePercent: 39.5,
          bossDamage: 43,
          ignoreDefense: 16
        }
      }
    ]
  },
  {
    id: "absolabs",
    label: "앱솔랩스",
    keywords: ["앱솔랩스"],
    tiers: [
      {
        min: 70,
        max: 139,
        stats: {
          maxDamage: 5500000,
          physicalAttackPercent: 12,
          physicalDamagePercent: 14,
          magicalAttackPercent: 12,
          magicalDamagePercent: 14,
          bossDamage: 10,
          ignoreDefense: 3
        }
      },
      {
        min: 140,
        max: 209,
        stats: {
          maxDamage: 11000000,
          physicalAttackPercent: 14.5,
          physicalDamagePercent: 16.5,
          magicalAttackPercent: 14.5,
          magicalDamagePercent: 16.5,
          bossDamage: 13,
          ignoreDefense: 5
        }
      },
      {
        min: 210,
        max: 244,
        stats: {
          finalDamage: 5,
          maxDamage: 18500000,
          physicalAttackPercent: 17,
          physicalDamagePercent: 19,
          magicalAttackPercent: 17,
          magicalDamagePercent: 19,
          bossDamage: 16,
          ignoreDefense: 7
        }
      },
      {
        min: 245,
        max: 279,
        stats: {
          finalDamage: 10,
          maxDamage: 29000000,
          physicalAttackPercent: 19.5,
          physicalDamagePercent: 21.5,
          magicalAttackPercent: 19.5,
          magicalDamagePercent: 21.5,
          bossDamage: 19,
          ignoreDefense: 9
        }
      },
      {
        min: 280,
        max: 280,
        stats: {
          finalDamage: 15,
          maxDamage: 42500000,
          physicalAttackPercent: 22,
          physicalDamagePercent: 24,
          magicalAttackPercent: 22,
          magicalDamagePercent: 24,
          bossDamage: 22,
          ignoreDefense: 11
        }
      }
    ]
  },
  {
    id: "fafnirHighnessTricksterEagleEye",
    label: "파프니르/하이네스/트릭스터/이글아이",
    keywords: ["파프니르", "하이네스", "트릭스터", "이글아이"],
    tiers: [
      {
        min: 30,
        max: 59,
        stats: {
          physicalAttackPercent: 8,
          physicalDamagePercent: 9,
          magicalAttackPercent: 8,
          magicalDamagePercent: 9,
          bossDamage: 5
        }
      },
      {
        min: 60,
        max: 89,
        stats: {
          physicalAttackPercent: 9.5,
          physicalDamagePercent: 10.5,
          magicalAttackPercent: 9.5,
          magicalDamagePercent: 10.5,
          bossDamage: 7.5
        }
      },
      {
        min: 90,
        max: 119,
        stats: {
          maxDamage: 1000000,
          physicalAttackPercent: 11,
          physicalDamagePercent: 12,
          magicalAttackPercent: 11,
          magicalDamagePercent: 12,
          bossDamage: 10
        }
      },
      {
        min: 120,
        max: 120,
        stats: {
          finalDamage: 5,
          maxDamage: 2400000,
          physicalAttackPercent: 12.5,
          physicalDamagePercent: 13.5,
          magicalAttackPercent: 12.5,
          magicalDamagePercent: 13.5,
          bossDamage: 12.5,
          ignoreDefense: 5
        }
      }
    ]
  },
  {
    id: "ravenhornLegendary",
    label: "레이븐혼/라이온하트/팔콘윙/드래곤테일/샤크투스 (레전더리)",
    keywords: ["레이븐혼", "라이온하트", "팔콘윙", "드래곤테일", "샤크투스"],
    itemGrades: ["레전더리"],
    tiers: [
      {
        min: 30,
        max: 59,
        stats: {
          physicalAttackPercent: 2.5,
          physicalDamagePercent: 2.5,
          magicalAttackPercent: 2.5,
          magicalDamagePercent: 2.5
        }
      },
      {
        min: 60,
        max: 89,
        stats: {
          physicalAttackPercent: 5,
          physicalDamagePercent: 5,
          magicalAttackPercent: 5,
          magicalDamagePercent: 5
        }
      },
      {
        min: 90,
        max: 90,
        stats: {
          physicalAttackPercent: 7.5,
          physicalDamagePercent: 7.5,
          magicalAttackPercent: 7.5,
          magicalDamagePercent: 7.5
        }
      }
    ]
  },
  {
    id: "ravenhornUnique",
    label: "레이븐혼/라이온하트/팔콘윙/드래곤테일/샤크투스 (유니크)",
    keywords: ["레이븐혼", "라이온하트", "팔콘윙", "드래곤테일", "샤크투스"],
    itemGrades: ["유니크"],
    tiers: [
      {
        min: 30,
        max: 59,
        stats: {
          physicalAttackPercent: 2,
          physicalDamagePercent: 2,
          magicalAttackPercent: 2,
          magicalDamagePercent: 2
        }
      },
      {
        min: 60,
        max: 89,
        stats: {
          physicalAttackPercent: 4,
          physicalDamagePercent: 4,
          magicalAttackPercent: 4,
          magicalDamagePercent: 4
        }
      },
      {
        min: 90,
        max: 90,
        stats: {
          physicalAttackPercent: 6,
          physicalDamagePercent: 6,
          magicalAttackPercent: 6,
          magicalDamagePercent: 6
        }
      }
    ]
  },
  {
    id: "challenger",
    label: "도전자의",
    keywords: ["도전자의"],
    tiers: [
      {
        min: 160,
        max: 169,
        stats: {
          maxDamage: 10000000,
          physicalAttackPercent: 14.5,
          physicalDamagePercent: 16.5,
          criticalDamage: 7.5,
          magicalAttackPercent: 14.5,
          magicalDamagePercent: 16.5,
          bossDamage: 13,
          ignoreDefense: 10
        }
      },
      {
        min: 170,
        max: 199,
        stats: {
          ignoreDefense: 15,
          bossDamage: 16,
          magicalDamagePercent: 19,
          magicalAttackPercent: 17,
          physicalDamagePercent: 19,
          physicalAttackPercent: 17,
          maxDamage: 15000000,
          finalDamage: 5,
          criticalDamage: 15
        }
      },
      {
        min: 200,
        max: null,
        stats: {
          ignoreDefense: 20,
          bossDamage: 19,
          magicalDamagePercent: 21.5,
          magicalAttackPercent: 19.5,
          physicalDamagePercent: 21.5,
          physicalAttackPercent: 19.5,
          maxDamage: 35000000,
          finalDamage: 10,
          criticalDamage: 30.5
        }
      }
    ]
  }
]);

module.exports = {
  starforceSetOptionGroups
};
