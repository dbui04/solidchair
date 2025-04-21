import { faker } from "@faker-js/faker";

export const generateCellValue = (columnType: string, columnName: string) => {
  switch (columnType) {
    case "number":
      return String(faker.number.int({ min: 1, max: 10000 }));
    case "text":
      if (columnName.toLowerCase().includes("name")) {
        return faker.person.fullName();
      } else if (columnName.toLowerCase().includes("email")) {
        return faker.internet.email();
      } else if (columnName.toLowerCase().includes("phone")) {
        return faker.phone.number();
      } else if (columnName.toLowerCase().includes("address")) {
        return faker.location.streetAddress();
      } else if (columnName.toLowerCase().includes("city")) {
        return faker.location.city();
      } else if (columnName.toLowerCase().includes("country")) {
        return faker.location.country();
      } else if (columnName.toLowerCase().includes("company")) {
        return faker.company.name();
      } else if (columnName.toLowerCase().includes("job")) {
        return faker.person.jobTitle();
      } else if (columnName.toLowerCase().includes("date")) {
        return faker.date.past().toLocaleDateString();
      } else {
        return faker.lorem.sentence();
      }
    default:
      return "";
  }
};
