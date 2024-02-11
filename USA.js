//Libraries
const axios = require("axios");
const fs = require("fs");
const SftpClient = require("ssh2-sftp-client");

// API URLs
const apiUrl =
  "https://datausa.io/api/data?drilldowns=Nation&measures=Population";
const apiUrl0 =
  "https://wad.datausa.io/api/data?measure=Citizenship%20Status&drilldowns=Citizenship";
const apiUrl1 =
  "https://wad.datausa.io/api/data?drilldowns=Year,Age&measures=Total+Population";
const apiUrl2 =
  "https://wad.datausa.io/api/data?Geography=01000US&measures=State%20Tuition&drilldowns=Sector";
const apiUrl3 =
  "https://wad.datausa.io/api/data?University=210809:similar,210809,210809:parents&measures=Median%20Grant%20Or%20Scholarship%20Award&drilldowns=Income%20Range";

// US Population by year
async function getPopulationData() {
  const response = await axios.get(apiUrl);

  // Iterates through the API to get the data
  const populationData = response.data.data.map((d) => {
    return {
      year: d.Year,
      population: d.Population,
    };
  });

  return populationData;
}

// NonCitizen Population
async function getNonCitizenPopData() {
  const response = await axios.get(apiUrl0);
  const nonCitizenData = response.data.data
    .filter((d) => d.Citizenship !== "Citizen")
    .map((d) => {
      return {
        year: d["ID Year"],
        population: d["Citizenship Status"],
      };
    });
  return nonCitizenData;
}

// Median Age
async function getMedianAgeByYear() {
  const response = await axios.get(apiUrl1);
  const data = response.data.data;

  // Group data by year
  const yearData = data.reduce((acc, cur) => {
    const { Year, Age, "Total Population": pop } = cur;
    //checks if the acc[year] exist and if not it creates it with proporties
    if (!acc[Year]) {
      acc[Year] = { population: [], age: [] };
    }
    //pushes population and age to year
    acc[Year].population.push(pop);
    acc[Year].age.push(Age);
    return acc;
  }, {});

  // Function that calculates the median between age and population
  const calculateMedian = (age, pop) => {
    const totalPop = pop.reduce((acc, cur) => acc + cur, 0); //gets the cumulative output of arrays
    const cumulativePop = []; //empty arrays to store cumulative pop and age
    const cumulativeAge = [];
    let sum = 0;
    for (let i = 0; i < age.length; i++) {
      //iterates through age array
      sum += pop[i];
      cumulativeAge.push(age[i]); //pushes the current element in the age array to the cumaliveAge array
      cumulativePop.push(sum);
      if (cumulativePop[cumulativePop.length - 1] >= totalPop / 2) {
        // checks if the cumulative population up to the current age is greater than or equal to half of the total population.
        return cumulativeAge[cumulativePop.length - 1];
      }
    }
  };

  // Function that uses the calculateMedian and applies it to the data parsed from the API
  const result = Object.keys(yearData).map((year) => {
    const { population, age } = yearData[year];
    const medianAge = calculateMedian(age, population); // calculates the median age using the cumulative population and age arrays
    return { year, medianAge };
  });
  return result;
}

// University Median Cost
async function getTuitionData() {
  const response = await axios.get(apiUrl2);

  const tuitionData = response.data.data.reduce((acc, cur) => {
    const { Year, Sector, "State Tuition": tuition } = cur;
    if (!acc[Year]) {
      acc[Year] = { population: [], tuition: [] };
    }
    acc[Year].population.push(1);
    acc[Year].tuition.push(tuition);
    return acc;
  }, {});

  // Calculate average tuition by year
  const result = Object.keys(tuitionData).map((year) => {
    const { population, tuition } = tuitionData[year];
    const totalPopulation = population.reduce((acc, cur) => acc + cur, 0);
    var averageTuition =
      tuition.reduce((acc, cur) => acc + cur, 0) / totalPopulation;
    averageTuition = averageTuition.toFixed(2);
    return { year, averageTuition };
  });

  return result;
}

//Median Financial Aid
async function getFinaid() {
  const response = await axios.get(apiUrl3);
  const data = response.data.data;

  // Group data by year
  const yearData = data.reduce((acc, cur) => {
    const { Year, "Median Grant Or Scholarship Award": aid } = cur;
    if (!acc[Year]) {
      acc[Year] = { totalAid: 0, count: 0 };
    }
    acc[Year].totalAid += aid; // Update totalAid property
    acc[Year].count++;
    return acc;
  }, {});

  const result = Object.keys(yearData).map((year) => {
    const { totalAid, count } = yearData[year];
    const averageAid = count > 0 ? (totalAid / count).toFixed(2) : 0; // Calculate average tuition
    return { year, averageAid };
  });

  return result;
}

//Function to upload file to SFTP server
async function uploadToSftpServer(tsvData) {
  const sftp = new SftpClient();

  try {
    // Connect to the SFTP server
    await sftp.connect({
      host: "192.168.86.33",
      port: 22,
      username: "tester",
      password: "password",
    });

    // Upload the TSV data to the SFTP server
    await sftp.put(Buffer.from(tsvData), "data.tsv");

    console.log("Data has been uploaded to SFTP server");
  } catch (error) {
    console.error("Error uploading data to SFTP server:", error);
  } finally {
    // Close the SFTP connection
    await sftp.end();
  }
}

//Main function to export data to TSV file and upload to SFTP server
async function exportDataToTsv() {
  try {
    const populationData = await getPopulationData();
    const nonCitizenPopData = await getNonCitizenPopData();
    const medianAgeData = await getMedianAgeByYear();
    const tuitionData = await getTuitionData();
    const aidData = await getFinaid();

    const sortedAidData = aidData.sort((a, b) => b.year - a.year);

    // Prepare data in TSV format
    let tsvData = ``;

    for (let i = 0; i < populationData.length; i++) {
      const year = populationData[i].year;
      const population = populationData[i].population;
      const nonCitizenPopulation = nonCitizenPopData[i].population;
      const medianAgeObj = medianAgeData.find((data) => data.year === year);
      const medianAge = medianAgeObj ? medianAgeObj.medianAge : "N/A"; // Add null check
      const averageTuitionObj = tuitionData.find((data) => data.year === year);
      const averageTuition = averageTuitionObj
        ? averageTuitionObj.averageTuition
        : "N/A"; // Add null check

      const averageAid = sortedAidData[i].averageAid;

      tsvData += `Year: ${year}\nPopulation: ${population}\nAge: ${medianAge}\nUniversityCost: ${averageTuition}\nUniversityAid: ${averageAid}\n\n\n`;
    }

    // Write data to TSV file
    fs.writeFileSync("data.tsv", tsvData, "utf-8");
    console.log("Data has been exported to data.tsv");

    //    Upload data to SFTP server
    await uploadToSftpServer(tsvData);
  } catch (error) {
    console.error("Error exporting data:", error);
  }
}

// Call the main function to export data to TSV file
exportDataToTsv();
