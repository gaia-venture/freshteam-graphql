const { GraphQLScalarType, Kind } = require('graphql');
const { ApolloServer, gql, AuthenticationError } = require('apollo-server');
const DataLoader = require('dataloader')
const axios = require("axios");
const parseLinkHeader = require('parse-link-header');
const { snakeCase } = require("snake-case");

const freshClient = axios.create({
  baseURL: `https://${process.env.FRESHTEAM_DOMAIN || "jiva"}.freshteam.com/`,
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.FRESHTEAM_TOKEN}`,
  },
});

async function loadAllFromPath(path) {
  console.log(`Fetching ${path}`);
  const res = await freshClient.get(path);
  const linkHeader = parseLinkHeader(res.headers.link);
  if(linkHeader && linkHeader.next) {
    return res.data.concat(await loadAll(linkHeader.next.url));
  }
  return res.data;
}

async function loadAll(path, args = {}) {
  let addToPath = '';
  const params = Object.entries(args);
  if(params.length > 0) {
    const urlParams = new URLSearchParams();
    params.forEach(([key, value]) => urlParams.set(snakeCase(key), value));
    addToPath = path.includes("?") ? `&${urlParams.toString()}` : `?${urlParams.toString()}`
  }

  return await loadAllFromPath(path + addToPath);
}

async function loadAllAndReturnById(path, ids) {
  const objects = await loadAll(path);
  const objectsById = {};
  objects.forEach(pod => {
    objectsById[pod.id] = pod;
  });
  return ids.map(id => objectsById[id]);
}

function buildLoaders(path) {
  return [
    (_ctx, args) => loadAll(path, args),
    new DataLoader(ids => loadAllAndReturnById(path, ids))
  ];
}

const [loadAllEmployees, employeeLoader] = buildLoaders("/api/employees?terminated=false&deleted=false&status=active");
const [loadAllPods, podLoader] = buildLoaders("/api/business_units");
const [loadAllDepartments, departmentLoader] = buildLoaders("/api/departments");
const [loadAllSubDepartments, subDepartmentLoader] = buildLoaders("/api/sub_departments");
const [loadAllLeaveTypes, leaveTypeLoader] = buildLoaders("/api/time_off_types");
const loadLeaves = (startDate, endDate) => loadAll(`/api/time_offs?start_date=${startDate}&end_date=${endDate}`);

const Date = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type',
  serialize(value) {
    return value;
  },
  parseValue(value) {
    if(/\d{4}-\d{2}-\d{2}/.test(value)) {
      return value;
    }
    return null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING && /\d{4}-\d{2}-\d{2}/.test(ast.value)) {
      return ast.value;
    }
    return null;
  },
});

function matchRegex(string, regex) {
  const match = string && string.match(regex);
  if(match) {
    return match[0];
  } else {
    return null;
  }
}

async function updateEmployeeAssignment(_, {id, params}) {
  const employeeParams = {};
  Object.entries(params).forEach(([key, value]) => employeeParams[snakeCase(key)] = parseInt(value));
  const results = await freshClient.put(`/api/employees/${id}`, employeeParams);
  return results.data;
}

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  scalar Date

  type Pod {
    id: ID!
    name: String!
    description: String
    slackChannel: String
  }

  enum EmployeeType {
    FULL_TIME
    CONTRACT
  }

  type Department {
    id: ID!
    name: String!
    description: String
  }

  type SubDepartment {
    id: ID!
    name: String!
    description: String
  }

  type Employee {
    id: ID!
    firstName: String!
    lastName: String!
    employeeType: EmployeeType
    email: String
    joiningDate: String
    pod: Pod
    designation: String
    department: Department
    subDepartment: SubDepartment
    dateOfBirth: String
  }

  enum LEAVE_STATUS {
    pending
    approved
    declined
    cancelled
  }

  type LeaveType {
    name: String
  }

  type Leave {
    comments: String
    startDate: Date!
    endDate: Date!
    employee: Employee!
    leaveType: LeaveType
    status: LEAVE_STATUS
  }

  type Query {
    employees(officialEmail: String): [Employee]
    pods: [Pod]
    departments: [Department]
    subDepartments: [SubDepartment]
    leaves(startDate: Date!, endDate: Date): [Leave]
    leaveTypes: [LeaveType]
  }

  input UpdateEmployeeParams {
    businessUnitId: ID
    departmentId: ID
    subDepartmentId: ID
  }

  type Mutation {
    updateEmployeeAssignment(id: ID!, params: UpdateEmployeeParams!): Employee
  }
`;

const resolvers = {
  Query: {
    employees: loadAllEmployees,
    pods: loadAllPods,
    departments: loadAllDepartments,
    subDepartments: loadAllSubDepartments,
    leaves: (_, {startDate, endDate = startDate}) => loadLeaves(startDate, endDate),
    leaveTypes: loadAllLeaveTypes,
  },
  Mutation: {
    updateEmployeeAssignment
  },
  Employee: {
    firstName: ({first_name}) => first_name,
    lastName: ({last_name}) => last_name,
    employeeType: ({employee_type}) => employee_type && employee_type.toUpperCase(),
    email: ({official_email}) => official_email,
    joiningDate: ({joining_date}) => joining_date,
    dateOfBirth: ({date_of_birth}) => date_of_birth,
    pod: ({business_unit_id}) => business_unit_id && podLoader.load(business_unit_id),
    department: ({department_id}) => department_id && departmentLoader.load(department_id),
    subDepartment: ({sub_department_id}) => sub_department_id && subDepartmentLoader.load(sub_department_id),
  },
  Leave: {
    startDate: ({start_date}) => start_date,
    endDate: ({end_date}) => end_date,
    employee: ({user_id}) => user_id && employeeLoader.load(user_id),
    leaveType: ({leave_type_id}) => leave_type_id && leaveTypeLoader.load(leave_type_id),
  },
  Date,
  Pod: {
    slackChannel: ({description}) => matchRegex(description, /#[^\s]+/)
  }
};

const {
  ApolloServerPluginLandingPageLocalDefault
} = require('apollo-server-core');

exports.apolloServerArgs = {
  typeDefs,
  resolvers,
  csrfPrevention: true,
  cache: 'bounded',
  context: ({req}) => {
    const token = req.headers.authorization || '';
    if(token != `Bearer ${process.env.TOKEN}`) {
      throw new AuthenticationError('you must be logged in');
    }
    return {};
  },
  /**
   * What's up with this embed: true option?
   * These are our recommended settings for using AS;
   * they aren't the defaults in AS3 for backwards-compatibility reasons but
   * will be the defaults in AS4. For production environments, use
   * ApolloServerPluginLandingPageProductionDefault instead.
  **/
  plugins: [
    ApolloServerPluginLandingPageLocalDefault({ embed: true }),
  ],
};
