const { GraphQLScalarType, Kind } = require('graphql');
const { ApolloServer, gql } = require('apollo-server');
const DataLoader = require('dataloader')
const axios = require("axios");
const parseLinkHeader = require('parse-link-header');

const freshClient = axios.create({
  baseURL: `https://${process.env.FRESHTEAM_DOMAIN || "jiva"}.freshteam.com/`,
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.FRESHTEAM_TOKEN}`,
  },
});
async function loadAll(path) {
  const res = await freshClient.get(path);
  const linkHeader = parseLinkHeader(res.headers.link);
  console.log(`Fetching ${path}`);
  if(linkHeader && linkHeader.next) {
    return res.data.concat(await loadAll(linkHeader.next.url));
  }
  return res.data;
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
    () => loadAll(path),
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

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  scalar Date

  type Pod {
    name: String
    description: String
  }

  enum EmployeeType {
    FULL_TIME
    CONTRACT
  }

  type Department {
    name: String
    description: String
  }

  type SubDepartment {
    name: String
    description: String
  }

  type Employee {
    firstName: String
    lastName: String
    employeeType: EmployeeType
    email: String
    joiningDate: String
    pod: Pod
    designation: String
    department: Department
    subDepartment: SubDepartment
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
    startDate: Date
    endDate: Date
    employee: Employee
    leaveType: LeaveType
    status: LEAVE_STATUS
  }

  type Query {
    employees: [Employee]
    pods: [Pod]
    departments: [Department]
    subDepartments: [SubDepartment]
    leaves(startDate: Date, endDate: Date): [Leave]
    leaveTypes: [LeaveType]
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
  Employee: {
    firstName: ({first_name}) => first_name,
    lastName: ({last_name}) => last_name,
    employeeType: ({employee_type}) => employee_type && employee_type.toUpperCase(),
    email: ({official_email}) => official_email,
    joiningDate: ({joining_date}) => joining_date,
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
};

const {
  ApolloServerPluginLandingPageLocalDefault
} = require('apollo-server-core');

// The ApolloServer constructor requires two parameters: your schema
// definition and your set of resolvers.
const server = new ApolloServer({
  typeDefs,
  resolvers,
  csrfPrevention: true,
  cache: 'bounded',
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
});

// The `listen` method launches a web server.
server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}graphql`);
});